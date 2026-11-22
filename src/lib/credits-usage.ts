/** Numbers behind the AI credits page: cost, tokens and per-day or per-model totals from the credit ledger. */

export const AED_PER_USD = 3.6725;

export type LedgerRow = {
  id: string; created_at: string; delta: number; reason: string; model: string | null;
  tokens_in: number | null; tokens_cached: number | null; tokens_out: number | null; cost_usd_micros: number | null;
};

/** Provider cost of one row in USD (the database stores micros). */
export const usdOf = (r: Pick<LedgerRow, "cost_usd_micros">) => Number(r.cost_usd_micros ?? 0) / 1_000_000;
export const aedOf = (r: Pick<LedgerRow, "cost_usd_micros">) => usdOf(r) * AED_PER_USD;
/** Tokens the model read (new plus cached input). */
export const inputTokens = (r: Pick<LedgerRow, "tokens_in" | "tokens_cached">) => Number(r.tokens_in ?? 0) + Number(r.tokens_cached ?? 0);
export const totalTokens = (r: LedgerRow) => inputTokens(r) + Number(r.tokens_out ?? 0);
/** One credit is spent per AI reply: negative ledger rows with a model are replies. */
export const isSpend = (r: LedgerRow) => r.delta < 0;

/** A day key in the Dubai calendar, so a reply at 01:00 Dubai time lands on that day. */
export const dayKey = (iso: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(typeof iso === "string" ? new Date(iso) : iso);

export function lastDays(range: number, now = new Date()): string[] {
  const today = dayKey(now);
  return Array.from({ length: range }, (_, i) => new Date(Date.parse(`${today}T00:00:00Z`) - (range - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

export type Metric = "credits" | "tokens" | "cost";
export const valueOf = (rows: LedgerRow[], metric: Metric) =>
  metric === "credits" ? rows.reduce((n, r) => n - r.delta, 0) : metric === "tokens" ? rows.reduce((n, r) => n + totalTokens(r), 0) : rows.reduce((n, r) => n + aedOf(r), 0);

export function sums(rows: LedgerRow[]) {
  const o = { replies: 0, credits: 0, input: 0, cached: 0, output: 0, usd: 0 };
  for (const r of rows) { o.replies++; o.credits -= r.delta; o.input += Number(r.tokens_in ?? 0); o.cached += Number(r.tokens_cached ?? 0); o.output += Number(r.tokens_out ?? 0); o.usd += usdOf(r); }
  return { ...o, tokens: o.input + o.cached + o.output, aed: o.usd * AED_PER_USD };
}

/** A tidy top value for the chart axis (four steps). */
export function niceMax(max: number): number {
  if (max <= 0) return 4;
  const raw = max / 4, pw = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / pw;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pw * 4;
}

export function axisLabel(v: number, metric: Metric): string {
  if (metric === "cost") return v >= 10 ? String(Math.round(v)) : v.toFixed(v < 1 ? 2 : 1);
  return v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0).replace(/\.0$/, "")}k` : String(+v.toFixed(1));
}

export const MODEL_COLORS = ["#e8b04a", "#7bd88f", "#6aa9ff", "#c8662a", "#b7a6ff", "#ff9bd2", "#8fd0ff"];
/** The same colour for the same model on every chart and table. */
export function modelColors(models: string[]): Record<string, string> {
  return Object.fromEntries([...new Set(models)].sort().map((m, i) => [m, MODEL_COLORS[i % MODEL_COLORS.length]!]));
}

/** Cost estimate from the rates: (input x in + cached x cache + output x out) / 1,000,000, in USD. */
export function estimateUsd(tokens: { input: number; cached: number; output: number }, rate: { usd_in_per_mtok: number; usd_cached_per_mtok: number; usd_out_per_mtok: number }): number {
  return (tokens.input * Number(rate.usd_in_per_mtok) + tokens.cached * Number(rate.usd_cached_per_mtok) + tokens.output * Number(rate.usd_out_per_mtok)) / 1_000_000;
}
