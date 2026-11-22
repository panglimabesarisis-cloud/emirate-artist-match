import { describe, expect, it } from "vitest";
import { buildFeed, clientBookingState, hoursUntilRelease, monthlyCommission, paymentLabel, statementSummary, withdrawalProblem, type CommissionRow, type PayoutRow } from "./client-portal-rules";
import { canClientConfirm, escrowReleaseAt } from "./booking-rules";

const base = { id: "11111111-2222-3333-4444-555555555555", invoice_no: null, total: 1050, paid_amount: 0, refund_amount: 0, deposit_pct: 100, event_date: "2026-12-20", completed_at: null, escrow_status: "none" };
const row = (o: Partial<CommissionRow>): CommissionRow => ({ booking_id: "b", reference: "INV-1", artist_name: "Amira", service: "Host", event_date: "2026-11-01", eligible_value: 5000, rate: 2, commission: 100, status: "available", credited_at: "2026-11-10T10:00:00Z", ...o });
const payout = (o: Partial<PayoutRow>): PayoutRow => ({ id: "p", reference: "WD-2026-AAAAAA", amount: 500, status: "paid", created_at: "2026-11-11T00:00:00Z", decided_at: "2026-11-12T00:00:00Z", paid_at: "2026-11-12T00:00:00Z", admin_note: null, account_snapshot: {}, ...o });

describe("withdrawal rule: AED 500 minimum, verified account, at most the available balance", () => {
  const ok = { available: 750, minimum: 500, verifiedAccount: true, hasAccount: true };
  it("accepts AED 500 from a AED 750 balance", () => expect(withdrawalProblem({ ...ok, amount: 500 })).toBeNull());
  it("rejects AED 499.99", () => expect(withdrawalProblem({ ...ok, amount: 499.99 })).toMatch(/minimum withdrawal is AED 500/));
  it("rejects more than the available balance", () => expect(withdrawalProblem({ ...ok, amount: 750.01 })).toMatch(/at most AED 750.00/));
  it("blocks while the balance is below AED 500", () => expect(withdrawalProblem({ ...ok, available: 499, amount: 499 })).toMatch(/must reach AED 500/));
  it("requires a verified payout account", () => expect(withdrawalProblem({ ...ok, verifiedAccount: false, amount: 600 })).toMatch(/waiting for verification/));
  it("requires a payout account", () => expect(withdrawalProblem({ ...ok, hasAccount: false, verifiedAccount: false, amount: 600 })).toMatch(/Add a payout account/));
});

describe("job confirmation: only completed jobs inside the 48 hour escrow hold", () => {
  it("allows a completed booking with a pending release", () => expect(canClientConfirm("completed", "release_pending")).toBe(true));
  it("refuses once the payment was released", () => expect(canClientConfirm("completed", "released")).toBe(false));
  it("refuses a confirmed booking that is not completed", () => expect(canClientConfirm("confirmed", "held")).toBe(false));
  it("releases automatically 48 hours after completion", () => expect(escrowReleaseAt("2026-11-20T10:00:00Z").toISOString()).toBe("2026-11-22T10:00:00.000Z"));
  it("counts down the hours left", () => expect(hoursUntilRelease("2026-11-20T10:00:00Z", new Date("2026-11-21T10:00:00Z"))).toBe(24));
});

describe("client booking state", () => {
  it("a quoted offer without an invoice asks the client to review the quotation", () => expect(clientBookingState({ ...base, status: "quoted" }, false).action).toBe("quotation"));
  it("an issued invoice with nothing paid asks for payment", () => expect(clientBookingState({ ...base, status: "quoted", invoice_no: "INV-9" }, false).action).toBe("pay"));
  it("a deposit-paid confirmed booking asks for the balance", () => expect(clientBookingState({ ...base, status: "confirmed", invoice_no: "INV-9", deposit_pct: 20, paid_amount: 210, escrow_status: "held" }, false).key).toBe("payment"));
  it("a completed job in the hold is awaiting completion", () => expect(clientBookingState({ ...base, status: "completed", paid_amount: 1050, escrow_status: "release_pending" }, false).key).toBe("job_review"));
  it("a released job without a review asks for a review", () => expect(clientBookingState({ ...base, status: "completed", paid_amount: 1050, escrow_status: "released" }, false).action).toBe("review"));
  it("labels a fully paid booking as paid", () => expect(paymentLabel({ total: 1050, paid_amount: 1050, refund_amount: 0, escrow_status: "held" }).label).toBe("Paid"));
});

describe("financial statement", () => {
  const rows = [row({ commission: 100, credited_at: "2026-10-05T00:00:00Z" }), row({ booking_id: "c", commission: 170, credited_at: "2026-11-10T00:00:00Z" }), row({ booking_id: "d", commission: 80, status: "pending", credited_at: "2026-11-15T00:00:00Z" })];
  const nov = statementSummary(rows, [payout({ amount: 50, paid_at: "2026-11-20T00:00:00Z" })], new Date("2026-11-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z"));
  it("opens with commission credited before the period", () => expect(nov.opening).toBe(100));
  it("counts only available commission credited in the period", () => expect(nov.credited).toBe(170));
  it("counts paid withdrawals in the period", () => expect(nov.withdrawn).toBe(50));
  it("closes at opening + credited - withdrawn", () => expect(nov.closing).toBe(220));
});

describe("commission chart and activity", () => {
  it("groups non-reversed commission by month", () => {
    const m = monthlyCommission([row({ commission: 100 }), row({ commission: 40, status: "reversed" }), row({ commission: 20, status: "pending" })], 6, new Date("2026-11-22T00:00:00Z"));
    expect(m.at(-1)).toMatchObject({ key: "2026-11", value: 120 });
    expect(m).toHaveLength(6);
  });
  it("hides commission events when commission alerts are off", () => {
    const feed = buildFeed({ bookings: [], payouts: [payout({})], support: [], commissions: [row({})], bookingAlerts: true, commissionAlerts: false });
    expect(feed).toHaveLength(0);
  });
});
