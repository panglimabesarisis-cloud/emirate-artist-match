import { describe, expect, it } from "vitest";
import { bookingPaymentEffects, subscriptionHasPaidBenefits, planChangePolicy } from "./payment-rules";

describe("confirmed payment policies", () => {
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