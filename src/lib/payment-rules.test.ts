import { describe, expect, it } from "vitest";
import { bookingPaymentEffects, subscriptionHasPaidBenefits, planChangePolicy, sandboxPaymentSettled, invoiceIsPaid, bookingIsFullyPaid } from "./payment-rules";

describe("confirmed payment policies", () => {
  it("recognizes paid invoices only from authoritative paid status", () => {
    expect(invoiceIsPaid("paid")).toBe(true);
    for (const status of ["unpaid", "partial", "pending", "complete", undefined, null]) expect(invoiceIsPaid(status)).toBe(false);
  });
  it("recognizes full payment, not a 20% booking deposit", () => {
    expect(bookingIsFullyPaid(5250, 5250, 0)).toBe(true);
    expect(bookingIsFullyPaid(5250, 1050, 0)).toBe(false);
    expect(bookingIsFullyPaid(0, 0, 0)).toBe(false);
  });
  it("does not recognize refunded bookings as fully paid", () => {
    expect(bookingIsFullyPaid(5250, 5250, 1050)).toBe(false);
    expect(bookingIsFullyPaid(5250, 5250, 5250)).toBe(false);
  });
  const paid = { livemode: false, status: "complete", payment_status: "paid", currency: "idr", amount_total: 514500 };
  it("recognizes only completed paid IDR sandbox payments", () => {
    expect(sandboxPaymentSettled(paid)).toBe(true);
    expect(sandboxPaymentSettled({ ...paid, payment_status: "unpaid" })).toBe(false);
    expect(sandboxPaymentSettled({ ...paid, status: "open" })).toBe(false);
  });
  it("never settles live payments through sandbox", () => {
    expect(sandboxPaymentSettled({ ...paid, livemode: true })).toBe(false);
  });
  it("rejects AED sessions from the IDR sandbox predicate", () => {
    expect(sandboxPaymentSettled({ ...paid, currency: "aed" })).toBe(false);
  });
  it("applies upgrades immediately with proration", () => {
    expect(planChangePolicy("upgrade")).toEqual({ effective: "immediate", prorate: true });
  });
  it("applies downgrades at next renewal without immediate proration", () => {
    expect(planChangePolicy("downgrade")).toEqual({ effective: "next_renewal", prorate: false });
  });
  it("confirms settled bookings, holds funds, and notifies client, artist and manager", () => {
    expect(bookingPaymentEffects("paid")).toEqual({ confirmBooking: true, holdFunds: true, notifyClient: true, notifyArtist: true, notifyManager: true });
    expect(bookingPaymentEffects("unpaid")).toEqual({ confirmBooking: false, holdFunds: false, notifyClient: false, notifyArtist: false, notifyManager: false });
  });
  it("activates benefits for a started paid subscription", () => {
    expect(subscriptionHasPaidBenefits("active", "2026-12-18T00:00:00Z", new Date("2026-11-18T00:00:00Z"))).toBe(true);
    expect(subscriptionHasPaidBenefits("incomplete", "2026-12-18T00:00:00Z", new Date("2026-11-18T00:00:00Z"))).toBe(false);
  });
  it("keeps canceled subscription benefits until the paid period ends", () => {
    const paidUntil = "2026-12-18T00:00:00Z";
    expect(subscriptionHasPaidBenefits("canceled", paidUntil, new Date("2026-12-17T23:59:59Z"))).toBe(true);
    expect(subscriptionHasPaidBenefits("canceled", paidUntil, new Date(paidUntil))).toBe(false);
  });
});