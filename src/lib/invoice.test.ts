import { describe, expect, it } from "vitest";
import { buildInvoice, decodeInvoice, encodeInvoice } from "./invoice";

describe("invoice", () => {
  it("normalizes quantities and retains exact 5% VAT for preview and sent invoices", () => {
    const inv = buildInvoice("INV-3", [{ title: "Acoustic", qty: 1.5, price: 100 }, { title: "Wedding", qty: 1, price: 250 }], null, null);
    expect(inv.items[0]?.qty).toBe(1);
    expect(inv.subtotal).toBe(350);
    expect(inv.vat).toBe(17.5);
    expect(inv.total).toBe(367.5);
    expect(decodeInvoice(encodeInvoice(inv))).toEqual(inv);
  });
  it("adds 5% VAT on qty x price", () => {
    const inv = buildInvoice("INV-1", [{ title: "DJ set", qty: 2, price: 1000 }], null, null);
    expect(inv.subtotal).toBe(2000); expect(inv.vat).toBe(100); expect(inv.total).toBe(2100);
  });
  it("rejects empty invoices", () => {
    expect(() => buildInvoice("INV-1", [{ title: " ", qty: 1, price: 5 }], null, null)).toThrow();
  });
  it("round-trips through a chat message", () => {
    const inv = buildInvoice("INV-2", [{ title: "Show", qty: 1, price: 500 }], "2026-12-01", "x");
    expect(decodeInvoice(encodeInvoice(inv))?.total).toBe(525);
    expect(decodeInvoice("hello")).toBeNull();
  });
});
