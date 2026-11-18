/** Booking money & policy rules (UAE, AED). Pure functions so they can be tested. */
export const VAT_RATE = 0.05;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function priceBreakdown(subtotal: number) {
  const s = r2(Math.max(0, subtotal));
  const vat = r2(s * VAT_RATE);
  return { subtotal: s, vat, total: r2(s + vat) };
}

export function daysUntil(eventDate: string, now = new Date()) {
  const ev = Date.UTC(+eventDate.slice(0, 4), +eventDate.slice(5, 7) - 1, +eventDate.slice(8, 10));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((ev - today) / 86_400_000);
}

/** Share of the paid amount returned to the client on cancellation. */
export function refundShare(by: "client" | "artist", eventDate: string, now = new Date()) {
  if (by === "artist") return 1;
  const d = daysUntil(eventDate, now);
  if (d >= 14) return 1;
  if (d >= 7) return 0.5;
  return 0;
}

export function refundAmount(paid: number, by: "client" | "artist", eventDate: string, now = new Date()) {
  return r2(paid * refundShare(by, eventDate, now));
}

export function canComplete(status: string, eventDate: string, now = new Date()) {
  return status === "confirmed" && daysUntil(eventDate, now) <= 0;
}

export const CONTRACT_TERMS = [
  "The artist performs the agreed package on the event date and location stated in this booking.",
  "The client pays the full total (incl. 5% VAT) into Dealmaker escrow. Funds are released to the artist after the event is marked completed.",
  "Client cancellation: 14+ days before the event = 100% refund, 7–13 days = 50% refund, under 7 days = no refund.",
  "If the artist cancels, the client receives a 100% refund.",
  "Both parties follow UAE law and venue rules; content must respect local cultural norms.",
];

/** Escrow is held this long after completion so the client can still raise a dispute. */
export const ESCROW_HOLD_HOURS = 48;

export function canDispute(status: string, escrowStatus: string) {
  return status === "confirmed" || (status === "completed" && escrowStatus === "release_pending");
}

export type BookingDraft = { title: string; amount: number; date: string; notes: string };

/** Parses the AI agent's `[BOOKING_READY {...}]` token. Returns the text without the token plus the draft (if valid). */
export function extractDraft(text: string): { text: string; draft: BookingDraft | null } {
  const m = text.match(/\[BOOKING_READY\s*(\{[\s\S]*?\})\s*\]/);
  if (!m) return { text, draft: null };
  const clean = text.replace(m[0], "").trim();
  try {
    const j = JSON.parse(m[1]!) as Record<string, unknown>;
    const amount = Number(j["amount"]);
    const date = String(j["date"] ?? "");
    if (!(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { text: clean, draft: null };
    return { text: clean, draft: { title: String(j["title"] ?? "Performance").slice(0, 120), amount, date, notes: String(j["notes"] ?? "").slice(0, 1000) } };
  } catch { return { text: clean, draft: null }; }
}
