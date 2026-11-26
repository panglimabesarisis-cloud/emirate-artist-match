/** Rules for the artist's AI agent page at /ai/<name>: usage figures and the "ai." host address. */
export type CreditRow = { id: string; created_at: string; delta: number; delta_fraction: number; final_charge_credits: number | null; reason: string };
export type Usage = { replies: number; used: number; bought: number; days: { date: string; used: number }[]; recent: { id: string; at: string; reason: string; change: number }[] };

const round = (n: number) => Math.round(n * 1000) / 1000;
export const dubaiDate = (at: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));

/**
 * Credit use read the way the studio's credit page reads it: a reservation is not a charge, and a settled
 * task costs its final charge.
 */
export function creditUsage(rows: CreditRow[], now = new Date()): Usage {
  const charged = rows.filter((r) => r.reason !== "ai_task_reserve").map((r) => ({
    id: r.id, at: r.created_at, reason: r.reason,
    change: r.reason === "ai_task_settlement" ? -Number(r.final_charge_credits ?? 0) : round(Number(r.delta) + Number(r.delta_fraction)),
  }));
  const spend = charged.filter((r) => r.change < 0 && !r.reason.startsWith("topup"));
  const days = Array.from({ length: 7 }, (_, i) => ({ date: dubaiDate(new Date(now.getTime() - (6 - i) * 86_400_000)), used: 0 }));
  for (const row of spend) {
    const day = days.find((d) => d.date === dubaiDate(row.at));
    if (day) day.used = round(day.used - row.change);
  }
  return {
    replies: spend.length,
    used: round(-spend.reduce((n, r) => n + r.change, 0)),
    bought: round(charged.filter((r) => r.reason.startsWith("topup")).reduce((n, r) => n + r.change, 0)),
    days,
    recent: [...charged].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8),
  };
}

/** First path segments the site itself uses; on the "ai." address they are not artist names. */
const SITE_PATHS = new Set(["ai", "account", "admin", "approve", "api", "artist", "assets", "auth", "booking", "chat", "checkout-return", "client", "dashboard", "features", "for-clients", "how-it-works", "how-you-get-booked", "join", "mcp", "p", "professional", "reset-password", "send-job", "support", "terms", "why-artists-join"]);

/** Where ai.<domain>/<name> should go, or null to serve the address as it is. */
export function aiHostRedirect(address: string): string | null {
  const url = new URL(address);
  if (!url.hostname.startsWith("ai.")) return null;
  const path = url.pathname.replace(/\/$/, "");
  if (!path) return `/ai${url.search}`;
  const name = /^\/([a-z0-9-]+)$/i.exec(path)?.[1]?.toLowerCase();
  return name && !SITE_PATHS.has(name) ? `/ai/${name}${url.search}` : null;
}
