import { describe, expect, it } from "vitest";
import { buildReceipt, orderLabel, planLater, splitVat } from "./receipt";
import { jpegToPdf } from "./receipt-pdf";
import { afterPaymentPath } from "./after-payment";

describe("checkout invoice", () => {
  it("splits a VAT-inclusive total to the fils", () => {
    expect(splitVat(105)).toEqual({ subtotal: 100, vat: 5, total: 105 });
    const odd = splitVat(523.95);
    expect(odd.subtotal + odd.vat).toBeCloseTo(523.95, 2);
  });
  it("lists the chosen plan outside the deposit total", () => {
    const later = planLater({ name: "Pro", monthly: 499 });
    expect(later[0]?.amount).toBe(523.95);
    const receipt = buildReceipt({ reference: "abc-123456789", label: orderLabel("deposit"), totalWithVat: 105, issued: "2026-11-25T00:00:00Z", paidAt: "2026-11-25T00:00:00Z", billTo: "Sample", later });
    expect(receipt).toMatchObject({ status: "paid", total: 105, subtotal: 100, vat: 5, number: "DM-23456789" });
    expect(planLater({ name: "Free", monthly: 0 })).toEqual([]);
  });
  it("is unpaid until a payment date exists", () => {
    expect(buildReceipt({ reference: "r", label: "x", totalWithVat: 10, issued: "2026-11-25T00:00:00Z", billTo: "A" }).status).toBe("unpaid");
  });
  it("names each kind of order", () => {
    expect(orderLabel("credits", { credits: 100 })).toBe("100 AI credits");
    expect(orderLabel("booking", { title: "Wedding set" })).toBe("Booking payment: Wedding set");
  });
  it("sends a signed-in payer to the dashboard and a guest back to their link", () => {
    expect(afterPaymentPath("/join/payment", true)).toBe("/join");
    expect(afterPaymentPath("/ai/dede-fajar", true)).toBe("/ai/dede-fajar");
    expect(afterPaymentPath("/dashboard", true)).toBe("/dashboard");
    expect(afterPaymentPath("/booking/abc?k=1", true)).toBe("/dashboard");
    expect(afterPaymentPath("/booking/abc?k=1", false)).toBe("/booking/abc?k=1");
    expect(afterPaymentPath("/chat/abc?k=1", false)).toBe("/chat/abc?k=1");
  });
  it("wraps the drawn invoice in a well-formed one-page PDF", () => {
    const pdf = jpegToPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 10, 20);
    const text = new TextDecoder("latin1").decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    for (const [index, match] of [...text.matchAll(/^(\d{10}) 00000 n /gm)].entries()) expect(text.slice(Number(match[1]), Number(match[1]) + 7)).toContain(`${index + 1} 0 obj`);
  });
});
