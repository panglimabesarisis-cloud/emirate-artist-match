import { catalogModel, type CatalogModel } from "./chat-model-catalog";
/** Plan model tiers (plan_tiers.allowed_models) mapped to gateway models; null keeps the default. */
export const DEFAULT_AGENT_MODEL = "openai/gpt-5.6-luna" as const;
export const AGENT_MODELS = { fast: "openai/gpt-5.4-mini", balanced: "openai/gpt-5.6-luna", advanced: "openai/gpt-5.5" } as const;
export type AgentModel = (typeof AGENT_MODELS)[keyof typeof AGENT_MODELS] | CatalogModel;
export function agentModel(choice: string | null | undefined): AgentModel {
  const selected = catalogModel(choice);
  if (selected) return selected.id;
  return choice && choice in AGENT_MODELS ? AGENT_MODELS[choice as keyof typeof AGENT_MODELS] : DEFAULT_AGENT_MODEL;
}
const LENGTH: Record<string, string> = { short: "Keep replies under 60 words.", medium: "Keep replies under 120 words.", detailed: "Keep replies under 220 words." };
export const replyLengthRule = (v: string | null | undefined) => LENGTH[v ?? "medium"] ?? LENGTH["medium"]!;
export function languageRule(langs: string[] | null | undefined) {
  const list = (langs ?? []).map((l) => l.trim()).filter(Boolean).slice(0, 10);
  return list.length ? `Reply in the client's language when it is one of: ${list.join(", ")}; otherwise reply in ${list[0]}.` : "Reply in the client's language (English or Arabic).";
}
export function handoffRule(h: unknown) {
  const o = (h && typeof h === "object" ? h : {}) as Record<string, unknown>;
  const on = (k: string) => o[k] !== false;
  const cases = [on("negotiation") && "the client keeps negotiating price beyond the allowed discount", on("complaints") && "the client complains or is upset", on("unclear") && "you cannot understand or answer the request"].filter(Boolean);
  return cases.length ? `HANDOVER CASES: offer to connect the client to the artist when ${cases.join("; or ")}. Wait for agreement before emitting [HANDOVER].` : "";
}

export type Usage = { seen: boolean; inTok: number; cached: number; outTok: number };
export const newUsage = (): Usage => ({ seen: false, inTok: 0, cached: 0, outTok: 0 });
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
/** Sum gateway usage across tool rounds; silently ignores responses without usage. */
export function addUsage(u: Usage, res: unknown) {
  try {
    const raw = (res as { usage?: Record<string, unknown> } | null)?.usage;
    if (!raw || typeof raw !== "object") return;
    const inTok = num(raw["input_tokens"] ?? raw["prompt_tokens"]);
    const outTok = num(raw["output_tokens"] ?? raw["completion_tokens"]);
    const details = (raw["input_tokens_details"] ?? raw["prompt_tokens_details"]) as Record<string, unknown> | undefined;
    const cached = num(details?.["cached_tokens"]);
    if (inTok === null && outTok === null) return;
    u.seen = true; u.inTok += inTok ?? 0; u.outTok += outTok ?? 0; u.cached += cached ?? 0;
  } catch { /* usage is optional */ }
}

/** Micro-USD cost from a rate row (per-million-token USD prices); cached tokens billed at the cached rate. */
export function usageCost(u: Usage, rate: { usd_in_per_mtok: number | string; usd_cached_per_mtok: number | string; usd_out_per_mtok: number | string } | null) {
  if (!rate || !u.seen) return null;
  return Math.round(Math.max(0, u.inTok - u.cached) * Number(rate.usd_in_per_mtok) + u.cached * Number(rate.usd_cached_per_mtok) + u.outTok * Number(rate.usd_out_per_mtok));
}
