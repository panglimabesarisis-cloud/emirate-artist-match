/** Client portal presentation and money rules. Pure functions so they can be tested. */
import { bookingPayment } from "./booking-payment-rules";
import { escrowReleaseAt } from "./booking-rules";

export type ClientBookingLike = {
  id: string; status: string; escrow_status: string; invoice_no: string | null; total: number | string; paid_amount: number | string;
  refund_amount: number | string; deposit_pct: number; event_date: string; completed_at: string | null; client_confirmed_at?: string | null;
};

export type BookingStateKey = "request" | "quotation" | "payment" | "confirmed" | "in_progress" | "job_review" | "completed" | "disputed" | "cancelled";
export type Tone = "gold" | "green" | "red" | "plain";
export type BookingAction = "quotation" | "pay" | "job" | "review" | "details" | "chat";

export const BOOKING_FILTERS: { key: BookingStateKey; label: string }[] = [
  { key: "request", label: "Pending" },
  { key: "quotation", label: "Quotation" },
  { key: "payment", label: "Awaiting payment" },
  { key: "confirmed", label: "Confirmed" },
  { key: "in_progress", label: "In progress" },
  { key: "job_review", label: "Awaiting completion" },
  { key: "completed", label: "Completed" },
  { key: "disputed", label: "Disputed" },
  { key: "cancelled", label: "Cancelled" },
];

export function bookingRef(b: { id: string; invoice_no?: string | null }) {
  return b.invoice_no || `BK-${b.id.slice(0, 8).toUpperCase()}`;
}

/** Where the client stands on a booking, and the one action that moves it forward. */
export function clientBookingState(b: ClientBookingLike, hasReview: boolean, today = new Date().toISOString().slice(0, 10)): { key: BookingStateKey; label: string; tone: Tone; action: BookingAction } {
  const pay = bookingPayment(Number(b.total), Number(b.paid_amount), b.deposit_pct);
  if (b.status === "cancelled") return { key: "cancelled", label: "Cancelled", tone: "red", action: "details" };
  if (b.status === "disputed" || b.escrow_status === "frozen") return { key: "disputed", label: "Disputed", tone: "red", action: "details" };
  if (b.status === "inquiry") return { key: "request", label: "Awaiting artist", tone: "gold", action: "details" };
  if (b.status === "quoted") {
    if (!b.invoice_no) return { key: "quotation", label: "Quotation", tone: "gold", action: "quotation" };
    return { key: "payment", label: "Awaiting payment", tone: "gold", action: pay.dueMinor > 0 ? "pay" : "details" };
  }
  if (b.status === "confirmed") {
    if (pay.dueMinor > 0 && Number(b.paid_amount) < Number(b.total)) return { key: "payment", label: "Balance due", tone: "gold", action: "pay" };
    if (b.event_date <= today) return { key: "in_progress", label: "In progress", tone: "gold", action: "details" };
    return { key: "confirmed", label: "Confirmed", tone: "green", action: "details" };
  }
  if (b.status === "completed") {
    if (b.escrow_status === "release_pending") return { key: "job_review", label: "Job review", tone: "gold", action: "job" };
    return { key: "completed", label: "Completed", tone: "green", action: hasReview ? "details" : "review" };
  }
  return { key: "request", label: b.status, tone: "plain", action: "details" };
}

export function paymentLabel(b: Pick<ClientBookingLike, "total" | "paid_amount" | "refund_amount" | "escrow_status">): { label: string; tone: Tone } {
  const total = Number(b.total), paid = Number(b.paid_amount), refund = Number(b.refund_amount);
  if (refund > 0 && refund >= paid) return { label: "Refunded", tone: "red" };
  if (refund > 0) return { label: "Partly refunded", tone: "gold" };
  if (paid <= 0) return { label: "Unpaid", tone: "gold" };
  if (paid < total) return { label: "Deposit paid", tone: "gold" };
  return { label: "Paid", tone: "green" };
}

/** Hours left before the escrow hold ends and payment is released automatically. */
export function hoursUntilRelease(completedAt: string | null, now = new Date()) {
  if (!completedAt) return null;
  return Math.max(0, Math.ceil((escrowReleaseAt(completedAt).getTime() - now.getTime()) / 3_600_000));
}

export type CommissionStatus = "pending" | "on_hold" | "available" | "reversed";
export const COMMISSION_LABEL: Record<CommissionStatus, string> = { pending: "Pending", on_hold: "On hold", available: "Available", reversed: "Reversed" };
export const COMMISSION_TONE: Record<CommissionStatus, Tone> = { pending: "gold", on_hold: "gold", available: "green", reversed: "red" };

export type CommissionRow = { booking_id: string; reference: string; artist_name: string; service: string; event_date: string; eligible_value: number | string; rate: number | string; commission: number | string; status: string; credited_at: string };
export type PayoutRow = { id: string; reference: string; amount: number | string; status: string; created_at: string; decided_at: string | null; paid_at: string | null; admin_note: string | null; account_snapshot: unknown };

/** Why a withdrawal request cannot be sent yet, or null when it can. Mirrors the database guard. */
export function withdrawalProblem(i: { amount: number; available: number; minimum: number; verifiedAccount: boolean; hasAccount: boolean }): string | null {
  if (!i.hasAccount) return "Add a payout account first.";
  if (!i.verifiedAccount) return "Your payout account is waiting for verification.";
  if (!Number.isFinite(i.amount) || i.amount <= 0) return "Enter an amount.";
  if (i.available < i.minimum) return `Your available balance must reach AED ${i.minimum.toLocaleString("en-US")} before you can withdraw.`;
  if (i.amount < i.minimum) return `The minimum withdrawal is AED ${i.minimum.toLocaleString("en-US")}.`;
  if (i.amount > i.available) return `Enter at most AED ${i.available.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
  if (Math.round(i.amount * 100) !== i.amount * 100) return "Use at most two decimals.";
  return null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Statement for [start, end): opening balance, commission credited, withdrawals paid and closing balance. */
export function statementSummary(rows: CommissionRow[], payouts: PayoutRow[], start: Date, end: Date) {
  const credited = rows.filter((r) => r.status === "available");
  const paid = payouts.filter((p) => p.status === "paid" && p.paid_at);
  const before = (iso: string) => new Date(iso) < start;
  const within = (iso: string) => { const d = new Date(iso); return d >= start && d < end; };
  const opening = r2(credited.filter((r) => before(r.credited_at)).reduce((s, r) => s + Number(r.commission), 0) - paid.filter((p) => before(p.paid_at!)).reduce((s, p) => s + Number(p.amount), 0));
  const lines = [
    ...credited.filter((r) => within(r.credited_at)).map((r) => ({ date: r.credited_at, reference: r.reference, label: `Commission · ${r.artist_name}`, amount: r2(Number(r.commission)) })),
    ...paid.filter((p) => within(p.paid_at!)).map((p) => ({ date: p.paid_at!, reference: p.reference, label: "Withdrawal paid", amount: -r2(Number(p.amount)) })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const creditedSum = r2(lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
  const withdrawnSum = r2(-lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0));
  return { opening, credited: creditedSum, withdrawn: withdrawnSum, closing: r2(opening + creditedSum - withdrawnSum), lines };
}

/** Statement periods: the last 12 calendar months plus the current and previous year. */
export function statementPeriods(now = new Date()) {
  const out: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let i = 0; i < 12; i++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    out.push({ key: start.toISOString().slice(0, 7), label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }), start, end });
  }
  for (const y of [now.getUTCFullYear(), now.getUTCFullYear() - 1]) out.push({ key: String(y), label: `Year ${y}`, start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y + 1, 0, 1)) });
  return out;
}

/** Commission (excluding reversed) grouped by the month it was credited or recorded. */
export function monthlyCommission(rows: CommissionRow[], months: number, now = new Date()) {
  const buckets: { key: string; label: string; value: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }), value: 0 });
  }
  for (const r of rows) {
    if (r.status === "reversed") continue;
    const b = buckets.find((x) => x.key === r.credited_at.slice(0, 7));
    if (b) b.value = r2(b.value + Number(r.commission));
  }
  return buckets;
}

/** Greeting by the time of day in Dubai. */
export function dubaiGreeting(now = new Date()) {
  const h = (now.getUTCHours() + 4) % 24;
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export type FeedEvent = { id: string; kind: "booking" | "commission" | "payout" | "support"; title: string; detail: string; at: string; section: string };

type FeedBooking = ClientBookingLike & { package_title: string | null; artist_name: string; created_at: string; paid_at: string | null; cancelled_at: string | null; escrow_released_at: string | null };

/** Account activity derived from bookings, commission, withdrawals and support replies, newest first. */
export function buildFeed(i: { bookings: FeedBooking[]; payouts: PayoutRow[]; support: { id: string; reference: string; status: string; replied_at: string | null }[]; commissions: CommissionRow[]; bookingAlerts: boolean; commissionAlerts: boolean }): FeedEvent[] {
  const ev: FeedEvent[] = [];
  if (i.bookingAlerts) {
    for (const b of i.bookings) {
      const ref = bookingRef(b), who = b.artist_name, what = b.package_title ?? "Booking";
      if (b.status === "quoted" && !b.invoice_no) ev.push({ id: `q-${b.id}`, kind: "booking", title: "New quotation received", detail: `${ref} · ${who} · ${what}`, at: b.created_at, section: "bookings" });
      else ev.push({ id: `c-${b.id}`, kind: "booking", title: b.status === "inquiry" ? "Booking request sent to the artist" : "Booking created", detail: `${ref} · ${who} · ${what}`, at: b.created_at, section: "bookings" });
      if (b.paid_at) ev.push({ id: `p-${b.id}`, kind: "booking", title: "Payment received", detail: `${ref} · payment verified`, at: b.paid_at, section: "bookings" });
      if (b.completed_at) ev.push({ id: `d-${b.id}`, kind: "booking", title: b.escrow_status === "release_pending" ? "Confirm job completion" : "Job completed", detail: `${ref} · ${who}`, at: b.completed_at, section: b.escrow_status === "release_pending" ? "jobs" : "reviews" });
      if (b.cancelled_at) ev.push({ id: `x-${b.id}`, kind: "booking", title: "Booking cancelled", detail: `${ref} · ${who}`, at: b.cancelled_at, section: "bookings" });
    }
    for (const s of i.support) if (s.replied_at) ev.push({ id: `s-${s.id}`, kind: "support", title: "Support replied", detail: `${s.reference} · ${s.status === "closed" ? "closed" : "answered"}`, at: s.replied_at, section: "support" });
  }
  if (i.commissionAlerts) {
    for (const c of i.commissions) if (c.status === "available") ev.push({ id: `m-${c.booking_id}`, kind: "commission", title: `Commission credited · AED ${Number(c.commission).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, detail: `${c.reference} · ${c.artist_name}`, at: c.credited_at, section: "history" });
    for (const p of i.payouts) {
      ev.push({ id: `w-${p.id}`, kind: "payout", title: "Withdrawal requested", detail: `${p.reference} · AED ${Number(p.amount).toLocaleString("en-US")}`, at: p.created_at, section: "withdrawals" });
      if (p.decided_at && p.status !== "submitted") ev.push({ id: `wd-${p.id}`, kind: "payout", title: p.status === "rejected" ? "Withdrawal rejected" : p.status === "paid" ? "Withdrawal paid" : "Withdrawal approved", detail: `${p.reference}${p.admin_note ? ` · ${p.admin_note}` : ""}`, at: p.paid_at ?? p.decided_at, section: "withdrawals" });
    }
  }
  return ev.sort((a, b) => b.at.localeCompare(a.at));
}

export function relativeTime(iso: string, now = new Date()) {
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  if (s < 172800) return "Yesterday";
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
