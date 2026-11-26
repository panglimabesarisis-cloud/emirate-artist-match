/** Web search for the Personal AI Agent: Google Search grounding with the admin's Google key. */
import { readGoogleBackup } from "./ai-provider.server";
import { withinLimits } from "./rate-limit.server";

export type WebSource = { title: string; url: string };
export type WebResult = { answer: string; sources: WebSource[] };

export const WEB_TOOL = {
  type: "function" as const,
  strict: true,
  name: "web_search",
  description: "Search the live web (news, flights, hotels, hospitals, facts, research). Returns findings with source links. Call it again with a narrower query for deeper research.",
  parameters: { type: "object", properties: { query: { type: "string", description: "What to look for, with dates, places and filters" } }, required: ["query"], additionalProperties: false },
};

export async function webSearch(artistId: string, query: string): Promise<WebResult> {
  const text = query.trim().slice(0, 1000);
  if (!text) throw new Error("Say what to search for.");
  // Searches are paid by the platform, so each talent has an hourly share.
  if (!(await withinLimits([[`websearch:${artistId}`, 30, "1 hour"]]))) throw new Error("The hourly web search limit is reached. Try again later.");
  const google = await readGoogleBackup();
  if (!google) throw new Error("Web search is not set up yet. The administrator adds a Google AI key in Settings.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${google.model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": google.key, "Content-Type": "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `Search the web and report facts with dates, names, prices and where each comes from. Today is ${new Date().toISOString().slice(0, 10)}. Request: ${text}` }] }],
      tools: [{ google_search: {} }],
    }),
  });
  // The status is enough; Google's error body can echo request content.
  if (!response.ok) throw new Error(`Web search failed (HTTP ${response.status})`);
  return readGrounded(await response.json());
}

/** The answer text and the pages it was grounded on. Only web links are kept. */
export function readGrounded(data: unknown): WebResult {
  const candidate = (data as { candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[] })?.candidates?.[0];
  const answer = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim().slice(0, 12000);
  if (!answer) throw new Error("The web search returned nothing");
  const seen = new Set<string>();
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? []).flatMap((c) => {
    const url = c.web?.uri ?? "";
    if (!/^https?:\/\/[^\s()<>]+$/i.test(url) || seen.has(url)) return [];
    seen.add(url);
    return [{ title: (c.web?.title ?? url).replace(/[\[\]\n]/g, " ").trim().slice(0, 120), url }];
  }).slice(0, 10);
  return { answer, sources };
}

/** Adds the source links to a reply that did not cite them. */
export function withSources(reply: string, sources: WebSource[]) {
  if (!sources.length || sources.some((s) => reply.includes(s.url))) return reply;
  return `${reply}\n\n**Sources**\n${sources.map((s) => `- [${s.title}](${s.url})`).join("\n")}`;
}
