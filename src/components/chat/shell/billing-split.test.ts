import { describe, expect, it } from "vitest";
import { encodeInvoice, buildInvoice } from "@/lib/invoice";
import { chatInvoices, splitBilling, type ChatBooking } from "./billing-split";

const invoice = (id: string, price: number, extra: object = {}) => ({ id: `m-${id}`, body: encodeInvoice({ ...buildInvoice(`INV-${id}`, [{ title: "Set", qty: 1, price }], null, null), id, ...extra }) });
const booking = (id: string, status: string, total: number): ChatBooking => ({ id, status, total, title: id, date: null });

describe("chat billing", () => {
  it("takes payment status from saved invoices and ignores chat-only ones", () => {
    const rows = chatInvoices([invoice("a", 100), invoice("old", 50), { id: "m", body: "hello" }], [{ id: "a", status: "paid" }]);
    expect(rows.map((r) => [r.inv.id, r.status])).toEqual([["a", "paid"]]);
  });

  it("splits unpaid from paid and counts an invoiced booking once", () => {
    const rows = chatInvoices([invoice("a", 1000, { bookingId: "b1" }), invoice("b", 200)], [{ id: "a", status: "unpaid" }, { id: "b", status: "paid" }]);
    const bills = splitBilling([booking("b1", "quoted", 1050), booking("b2", "quoted", 500), booking("b3", "confirmed", 300), booking("b4", "inquiry", 900), booking("b5", "cancelled", 900)], rows);
    expect(bills.unpaidBookings.map((b) => b.id)).toEqual(["b2"]);
    expect(bills.paidBookings.map((b) => b.id)).toEqual(["b3"]);
    expect(bills.paidInvoices.map((r) => r.inv.id)).toEqual(["b"]);
    expect(bills.outstanding).toBe(1550);
  });

  it("drops bills past their due or event date, but keeps a part-paid booking's invoice", () => {
    const due = (id: string, date: string, extra: object = {}) => invoice(id, 100, { due: date, ...extra });
    const rows = chatInvoices(
      [due("late", "2026-11-01"), due("today", "2026-11-25"), due("held", "2026-11-01", { bookingId: "part" })],
      ["late", "today", "held"].map((id) => ({ id, status: "unpaid" })),
    );
    const past = { ...booking("old", "quoted", 400), date: "2026-11-01" };
    const part = { ...booking("part", "confirmed", 800), paidAmount: 200 };
    const bills = splitBilling([past, part], rows, "2026-11-25");
    expect(bills.unpaidInvoices.map((r) => r.inv.id)).toEqual(["today", "held"]);
    expect(bills.unpaidBookings).toEqual([]);
    // The Payment button opens the nearest due date first.
    expect(bills.payable.map((p) => (p.kind === "invoice" ? p.row.inv.id : p.booking.id))).toEqual(["held", "today"]);
  });
});
