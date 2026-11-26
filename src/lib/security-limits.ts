/** The limits an administrator can change in Settings → Security. Bounds keep them useful: neither off nor unusable. */
export const LIMIT_FIELDS = [
  { key: "chatsPerHour", label: "New chats per client per hour", min: 1, max: 100, value: 5 },
  { key: "chatsPerDay", label: "New chats per client per day", min: 1, max: 300, value: 15 },
  { key: "messagesPerHour", label: "Chat messages per client per hour", min: 5, max: 600, value: 60 },
  { key: "artistRepliesPerDay", label: "AI replies per artist per day", min: 10, max: 5000, value: 200 },
  { key: "conciergePerVisitor", label: "Concierge questions per visitor per hour", min: 1, max: 200, value: 20 },
  { key: "conciergeTotal", label: "Concierge questions for everyone per hour", min: 10, max: 10000, value: 500 },
] as const;
export type SecurityLimits = Record<(typeof LIMIT_FIELDS)[number]["key"], number>;

export const DEFAULT_LIMITS = Object.fromEntries(LIMIT_FIELDS.map((f) => [f.key, f.value])) as SecurityLimits;

/** Saved limits; anything missing or outside its bounds falls back to the default. */
export function parseLimits(saved: unknown): SecurityLimits {
  let source: unknown = saved;
  if (typeof saved === "string") { try { source = JSON.parse(saved); } catch { source = null; } }
  const record = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
  return Object.fromEntries(LIMIT_FIELDS.map((f) => { const n = Number(record[f.key]); return [f.key, Number.isInteger(n) && n >= f.min && n <= f.max ? n : f.value]; })) as SecurityLimits;
}

/** The first reason the limits cannot be saved, or null. */
export function limitProblem(limits: Record<string, number>): string | null {
  for (const f of LIMIT_FIELDS) {
    const n = limits[f.key];
    if (n === undefined || !Number.isInteger(n) || n < f.min || n > f.max) return `${f.label}: use a whole number from ${f.min} to ${f.max}`;
  }
  return limits["chatsPerDay"]! < limits["chatsPerHour"]! ? "The daily chat limit cannot be below the hourly one" : null;
}
