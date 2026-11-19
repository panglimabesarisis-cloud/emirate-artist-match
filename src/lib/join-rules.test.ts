import { describe, it, expect } from "vitest";
import { specialtyLimit, joinPaymentTotal } from "./join-rules";
describe("join rules", () => {
  it("free allows 1 specialty", () => expect(specialtyLimit("free")).toBe(1));
  it("medium allows 3 specialties", () => expect(specialtyLimit("medium")).toBe(3));
  it("pro allows 10 specialties", () => expect(specialtyLimit("pro")).toBe(10));
  it("medium payment is 199 + 5% VAT", () => expect(joinPaymentTotal(199)).toEqual({ subtotal: 199, vat: 9.95, total: 208.95 }));
});
