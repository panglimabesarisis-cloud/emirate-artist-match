/**
 * Every model call goes through here. Lovable's gateway is used first; when it refuses before doing any
 * work (credits used up, gateway unavailable) the same request is answered by Google Gemini with the
 * admin's own key, through Google's OpenAI-compatible endpoint.
 */
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";

type Params = Parameters<typeof generateResponse>[0];
type Result = Awaited<ReturnType<typeof generateResponse>>;
type Item = Record<string, unknown>;
export type GoogleBackup = { key: string; model: string };

export const DEFAULT_GOOGLE_MODEL = "gemini-3.8-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

/** Gemini signs its function calls and wants the signature back with the result. */
const signatures = new Map<string, unknown>();
function remember(callId: string, extra: unknown) {
  signatures.set(callId, extra);
  if (signatures.size > 500) signatures.delete(signatures.keys().next().value as string);
}
/** For calls another provider made, Google's documented way to skip the signature check. */
const UNSIGNED = { google: { thought_signature: "skip_thought_signature_validator" } };

function parts(content: unknown) {
  if (typeof content === "string") return content;
  return (Array.isArray(content) ? (content as Item[]) : []).map((part) => {
    if (part["type"] === "input_image") return { type: "image_url", image_url: { url: part["image_url"] } };
    if (part["type"] === "input_file") return { type: "text", text: `(The attached file ${JSON.stringify(part["filename"] ?? "")} cannot be read by the backup AI. Say so if the user asks about it.)` };
    return { type: "text", text: String(part["text"] ?? "") };
  });
}

function messages(request: Item) {
  const out: Item[] = [];
  if (request["instructions"]) out.push({ role: "system", content: request["instructions"] });
  const input = request["input"];
  if (typeof input === "string") return [...out, { role: "user", content: input }];
  for (const item of (Array.isArray(input) ? input : []) as Item[]) {
    if (item["type"] === "function_call") {
      const id = String(item["call_id"]);
      out.push({ role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name: item["name"], arguments: item["arguments"] }, extra_content: signatures.get(id) ?? UNSIGNED }] });
    } else if (item["type"] === "function_call_output") {
      out.push({ role: "tool", tool_call_id: item["call_id"], content: item["output"] });
    } else if (item["role"]) {
      out.push({ role: item["role"] === "developer" ? "system" : item["role"], content: parts(item["content"]) });
    }
  }
  return out;
}

export async function geminiResponse(params: unknown, backup: GoogleBackup): Promise<Result> {
  const request = params as Item;
  const limit = Number(request["max_output_tokens"]) || undefined;
  const tools = ((request["tools"] as Item[] | undefined) ?? []).filter((t) => t["type"] === "function")
    .map((t) => ({ type: "function", function: { name: t["name"], description: t["description"], parameters: t["parameters"] } }));
  const format = (request["text"] as { format?: Item } | undefined)?.format;
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${backup.key}`, "Content-Type": "application/json" },
    // The edge runtime has no "error" mode; a redirect is not followed and fails the status check below.
    redirect: "manual",
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: backup.model,
      messages: messages(request),
      reasoning_effort: "low",
      // Gemini counts its thinking inside this limit, so the visible reply needs headroom.
      max_completion_tokens: Math.max(4096, (limit ?? 1000) * 4),
      ...(tools.length ? { tools, ...(request["tool_choice"] === "none" ? { tool_choice: "none" } : {}) } : {}),
      ...(format?.["type"] === "json_schema" ? { response_format: { type: "json_schema", json_schema: { name: format["name"], schema: format["schema"] } } } : {}),
    }),
  });
  // The status is enough to act on; Google's error body can echo request content.
  if (!response.ok) throw new Error(`Google AI request failed (HTTP ${response.status})`);
  const data = (await response.json()) as {
    id?: string;
    choices?: { finish_reason?: string; message?: { content?: string | null; tool_calls?: { id?: string; function: { name: string; arguments: string }; extra_content?: unknown }[] } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
  const choice = data.choices?.[0];
  if (!choice?.message) throw new Error("Google AI returned no reply");
  const output: Item[] = [];
  for (const call of choice.message.tool_calls ?? []) {
    const callId = call.id || `call_${crypto.randomUUID()}`;
    if (call.extra_content) remember(callId, call.extra_content);
    output.push({ type: "function_call", name: call.function.name, call_id: callId, arguments: call.function.arguments });
  }
  if (choice.message.content) output.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: choice.message.content }] });
  const usage = data.usage;
  return {
    id: data.id,
    status: choice.finish_reason === "length" ? "incomplete" : "completed",
    output,
    ...(usage ? { usage: {
      input_tokens: usage.prompt_tokens ?? 0,
      input_tokens_details: { cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0 },
      // Artists are charged as before: never more output than the reply they were allowed.
      output_tokens: Math.min(usage.completion_tokens ?? 0, limit ?? Number.MAX_SAFE_INTEGER),
    } } : {}),
  } as unknown as Result;
}

export async function readGoogleBackup(): Promise<GoogleBackup | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("admin_secrets").select("key,value").in("key", ["google_api_key", "google_model"]);
  if (error) return null;
  const value = (key: string) => data?.find((row) => row.key === key)?.value?.trim() ?? "";
  const key = value("google_api_key");
  if (!key) return null;
  const model = value("google_model").replace(/^google\//, "");
  return { key, model: /^[a-z0-9.-]+$/.test(model) ? model : DEFAULT_GOOGLE_MODEL };
}

/** Only a refusal that cost nothing may be repeated elsewhere; an unclear outcome is never sent twice. */
const refused = (error: unknown) => error instanceof GatewayError && (error.code === "payment_required" || error.outcome === "not_started");

export async function aiResponse(params: Params): Promise<Result> {
  try {
    return await generateResponse(params);
  } catch (error) {
    if (!refused(error)) throw error;
    const backup = await readGoogleBackup();
    if (!backup) throw error;
    try {
      return await geminiResponse(params, backup);
    } catch (failure) {
      console.error("Google AI backup failed", failure instanceof Error ? failure.message : "unknown");
      // Callers settle credits and message the client from the first refusal.
      throw error;
    }
  }
}
