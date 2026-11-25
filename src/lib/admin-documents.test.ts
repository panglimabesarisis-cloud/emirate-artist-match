import { describe, expect, it } from "vitest";
import { accountStatement, bookingPaper, browserName, ledgerReport, paymentState, permissionFor, togglePermission, trialBalance, vatParts } from "./admin-documents";

const booking = { id: "abcdef12-0000", invoice_no: null, artist_name: "Artist", client_name: "Client", package_title: "Show", amount: "1000", vat_amount: "50", total: "1050", paid_amount: "1050", event_date: "2027-01-10", status: "confirmed" };

describe("admin documents", () => {
  it("builds the booking invoice from recorded amounts", () => {
    const paper = bookingPaper(booking);
    expect(paper).toMatchObject({ number: "BK-ABCDEF12", status: "paid", total: 1050, subtotal: 1000, vat: 50 });
    expect(paper.items).toEqual([{ title: "Show", qty: 1, price: 1000 }]);
    expect(bookingPaper({ ...booking, invoice_items: [{ title: "Set", qty: 2, price: 500 }, { bad: true }] }).items).toHaveLength(1);
  });
  it("calls an invoice paid only when everything is collected", () => {
    expect([paymentState(100, 100), paymentState(100, 40), paymentState(100, 0), paymentState(100, 0, "cancelled"), paymentState(0, 0)]).toEqual(["paid", "partial", "unpaid", "expired", "unpaid"]);
  });
  it("splits VAT without losing a fil", () => {
    const parts = vatParts(51.45);
    expect(Math.round((parts.net + parts.vat) * 100)).toBe(5145);
  });
  it("balances accounts on their normal side", () => {
    const line = (account: string, debit: number, credit: number) => ({ journal: "j", entry_date: "2026-11-01", reference: "r", account, debit, credit, memo: "" });
    const result = trialBalance([line("Cash at payment processor", 105, 0), line("Subscription and credit revenue", 0, 100), line("VAT payable (5%)", 0, 5)]);
    expect(result).toMatchObject({ balanced: true, debit: 105, credit: 105, revenue: 100, assets: 105, liabilities: 5 });
    expect(trialBalance([line("Cash at payment processor", 1, 0)]).balanced).toBe(false);
  });
  it("carries opening balances into the period and runs them forward", () => {
    const line = (journal: string, entry_date: string, account: string, debit: number, credit: number) => ({ journal, entry_date, reference: journal, account, debit, credit, memo: "" });
    const lines = [line("b", "2026-11-02", "Artist payable", 30, 0), line("b", "2026-11-02", "Cash at payment processor", 0, 30), line("a", "2026-10-01", "Cash at payment processor", 100, 0), line("a", "2026-10-01", "Artist payable", 0, 100)];
    const report = ledgerReport(lines, "2026-11-01");
    expect(report).toMatchObject({ debit: 30, credit: 30, balanced: true });
    expect(report.accounts.find((a) => a.name === "Artist payable")).toMatchObject({ opening: 100, debit: 30, credit: 0, closing: 70 });
    expect(accountStatement(report.period, "Cash at payment processor", 100).map((l) => l.balance)).toEqual([70]);
  });
  it("names the browser and system", () => {
    expect(browserName("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Edge 130 · Windows");
    expect(browserName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile Safari/604.1")).toBe("Safari 18 · iOS");
    expect(browserName(null)).toBe("—");
  });
  it("treats a module without a saved row as allowed and keeps read consistent", () => {
    expect(permissionFor([], "finance")).toMatchObject({ can_read: true, can_edit: true, can_delete: true });
    expect(togglePermission(permissionFor([], "finance"), "can_read", false)).toMatchObject({ can_edit: false, can_delete: false });
    expect(togglePermission({ module: "x", can_read: false, can_edit: false, can_delete: false }, "can_delete", true)).toMatchObject({ can_read: true, can_delete: true, can_edit: false });
  });
});
