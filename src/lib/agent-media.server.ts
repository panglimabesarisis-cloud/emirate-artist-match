/** Image and video generation with the admin's Google key. Results are stored in the talent's private chat folder. */
import { readGoogleBackup } from "./ai-provider.server";
import { withinLimits } from "./rate-limit.server";
import { VIDEO_JOB, pickMediaModel, type ListedModel } from "./agent-media";

const API = "https://generativelanguage.googleapis.com/v1beta";
const BUCKET = "agent-chat";

async function setup(kind: "image" | "video") {
  const google = await readGoogleBackup();
  if (!google) throw new Error("Media creation is not set up yet. The administrator adds a Google AI key in Settings.");
  const listed = await fetch(`${API}/models?pageSize=1000`, { headers: { "x-goog-api-key": google.key }, redirect: "manual", signal: AbortSignal.timeout(10_000) });
  const model = listed.ok ? pickMediaModel(kind, ((await listed.json()) as { models?: ListedModel[] }).models ?? []) : null;
  if (!model) throw new Error(`The Google key offers no ${kind} model.`);
  return { key: google.key, model };
}

async function store(artistId: string, bytes: Uint8Array, mime: string, extension: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const path = `${artistId}/generated/${crypto.randomUUID()}.${extension}`;
  const saved = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: mime });
  if (saved.error) throw new Error("Could not save the file");
  return path;
}

export async function generateImage(artistId: string, prompt: string, aspect: string): Promise<string> {
  if (!prompt.trim()) throw new Error("Describe the picture.");
  // Media is paid by the platform, so each talent has a share.
  if (!(await withinLimits([[`image:${artistId}`, 20, "1 hour"], [`image-day:${artistId}`, 60, "1 day"]]))) throw new Error("The picture limit is reached. Try again later.");
  const { key, model } = await setup("image");
  const response = await fetch(`${API}/models/${model}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, redirect: "manual", signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `${prompt.slice(0, 4000)}\nAspect ratio ${aspect}.` }] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
  });
  if (!response.ok) throw new Error(`Picture creation failed (HTTP ${response.status})`);
  const data = (await response.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };
  const image = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  const mime = image?.mimeType ?? "";
  if (!image?.data || !/^image\/(png|jpeg|webp)$/.test(mime)) throw new Error("No picture was returned. Try another description.");
  return store(artistId, Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0)), mime, mime.split("/")[1]!);
}

export async function startVideo(artistId: string, prompt: string, aspect: string): Promise<string> {
  if (!prompt.trim()) throw new Error("Describe the video.");
  if (!(await withinLimits([[`video:${artistId}`, 3, "1 day"]]))) throw new Error("The limit of 3 videos a day is reached.");
  const { key, model } = await setup("video");
  const response = await fetch(`${API}/models/${model}:predictLongRunning`, {
    method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, redirect: "manual", signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({ instances: [{ prompt: prompt.slice(0, 4000) }], parameters: { aspectRatio: aspect === "9:16" ? "9:16" : "16:9" } }),
  });
  if (!response.ok) throw new Error(`Video creation failed (HTTP ${response.status})`);
  const name = ((await response.json()) as { name?: string }).name ?? "";
  if (!VIDEO_JOB.test(name)) throw new Error("Video creation did not start.");
  return name;
}

/** Stores a finished video. "pending" while Google is still making it. */
export async function finishVideo(artistId: string, job: string): Promise<{ status: "pending" } | { status: "failed" } | { status: "done"; path: string }> {
  if (!VIDEO_JOB.test(job)) return { status: "failed" };
  const google = await readGoogleBackup();
  if (!google) return { status: "failed" };
  const headers = { "x-goog-api-key": google.key };
  const response = await fetch(`${API}/${job}`, { headers, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) return { status: "pending" };
  const op = (await response.json()) as { done?: boolean; error?: unknown; response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri?: string } }[] } } };
  if (!op.done) return { status: "pending" };
  const uri = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ?? "";
  if (op.error || !uri.startsWith("https://generativelanguage.googleapis.com/")) return { status: "failed" };
  let file = await fetch(uri, { headers, redirect: "manual", signal: AbortSignal.timeout(60_000) });
  // The key stays with Google's API; a download address it forwards to gets no key.
  const next = file.headers.get("location");
  if (next?.startsWith("https://")) file = await fetch(next, { signal: AbortSignal.timeout(60_000) });
  if (!file.ok) return { status: "pending" };
  return { status: "done", path: await store(artistId, new Uint8Array(await file.arrayBuffer()), "video/mp4", "mp4") };
}
