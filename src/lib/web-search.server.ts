/** Web search for the Personal AI Agent: Google Search grounding with the admin's Google key. */
import { personalModels, readGoogleBackup } from "./ai-provider.server";
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

/** The websites saved for a topic, checked first. A failed read searches the whole web. */
export async function preferredSites(topic: "flight"): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("agent_search_sources").select("domain").eq("topic", topic).eq("active", true).order("domain");
  if (error) console.error("Search sources unavailable", error.message);
  return (data ?? []).map((row) => row.domain);
}

export async function webSearch(artistId: string, query: string, sites: string[] = []): Promise<WebResult> {
  const text = query.trim().slice(0, 1000);
  if (!text) throw new Error("Say what to search for.");
  // Searches are paid by the platform, so each talent has an hourly share.
  if (!(await withinLimits([[`websearch:${artistId}`, 30, "1 hour"]]))) throw new Error("The hourly web search limit is reached. Try again later.");
  const google = await readGoogleBackup();
  if (!google) throw new Error("Web search is not set up yet. The administrator adds a Google AI key in Settings.");
  const ask = (model: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": google.key, "Content-Type": "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `Search the web and report facts with dates, names, prices and where each comes from. Today is ${new Date().toISOString().slice(0, 10)}. Request: ${text}${sites.length ? ` Check these websites first and cite their pages: ${sites.join(", ")}.` : ""}` }] }],
      tools: [{ google_search: {} }],
    }),
  });
  // The admin's model answers when the agent's own model is refused.
  const [first, ...others] = personalModels(google.model);
  let response = await ask(first!);
  for (const model of others) if (!response.ok) response = await ask(model);
  // The status is enough; Google's error body can echo request content.
  if (!response.ok) throw new Error(`Web search failed (HTTP ${response.status})`);
  const found = readGrounded(await response.json());
  return { ...found, sources: await Promise.all(found.sources.map(destination)) };
}

/** Google hands back its own forwarding address; follow it one step to the page itself. */
async function destination(source: WebSource): Promise<WebSource> {
  if (!source.url.startsWith("https://vertexaisearch.cloud.google.com/")) return source;
  try {
    const hop = await fetch(source.url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    const next = hop.headers.get("location") ?? "";
    return /^https?:\/\/[^\s()<>]+$/i.test(next) ? { ...source, url: next } : source;
  } catch { return source; }
}

/** The answer text and the pages it was grounded on. Only web links are kept. */
export function readGrounded(data: unknown): WebResult {
  const candidate = (data as { candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[] })?.candidates?.[0];
  const answer = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim().slice(0, 6000);
  if (!answer) throw new Error("The web search returned nothing");
  const seen = new Set<string>();
  const sources = (candidate?.groundingMetadata?.groundingChunks ?? []).flatMap((c) => {
    const url = c.web?.uri ?? "";
    if (!/^https?:\/\/[^\s()<>]+$/i.test(url) || seen.has(url)) return [];
    seen.add(url);
    return [{ title: (c.web?.title ?? url).replace(/[\[\]\n]/g, " ").trim().slice(0, 120), url }];
  }).slice(0, 12);
  return { answer, sources };
}

/** Adds the source links to a reply that did not cite them. */
export function withSources(reply: string, sources: WebSource[]) {
  const rest = sources.filter((s) => !reply.includes(s.url));
  if (!rest.length) return reply;
  return `${reply}\n\n**Sources**\n${rest.map((s) => `- [${s.title}](${s.url})`).join("\n")}`;
}
