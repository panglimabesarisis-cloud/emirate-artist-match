import { describe, it, expect } from "vitest";
import { specialtyLimit, joinPaymentTotal, JOIN_DEPOSIT_AED } from "./join-rules";
describe("join rules", () => {
  it("free allows 1 specialty", () => expect(specialtyLimit("free")).toBe(1));
  it("basic allows 2 specialties", () => expect(specialtyLimit("basic")).toBe(2));
  it("medium allows 3 specialties", () => expect(specialtyLimit("medium")).toBe(3));
  it("pro allows 10 specialties", () => expect(specialtyLimit("pro")).toBe(10));
  it("deposit is AED 100 for every plan", () => expect(JOIN_DEPOSIT_AED).toBe(100));
  it("deposit total is 100 + 5% VAT", () => expect(joinPaymentTotal()).toEqual({ subtotal: 100, vat: 5, total: 105 }));
});
