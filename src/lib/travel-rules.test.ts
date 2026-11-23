import { describe, expect, it } from "vitest";
import { clientTravelDistance, travelEstimate, travelPrompt } from "./travel-rules";
const settings = { travel_surcharge_enabled: true, travel_radius_km: 30, travel_step_km: 10, travel_fee_per_step: 50 };
describe("optional travel charges", () => {
  it("charges two 10 km intervals from 30 to 50 km", () => expect(travelEstimate(50, settings).feeAED).toBe(100));
  it("supports four 5 km intervals from 30 to 50 km", () => expect(travelEstimate(50, { ...settings, travel_step_km: 5 }).intervals).toBe(4));
  it("charges nothing inside the 30 km radius", () => expect(travelEstimate(30, settings).feeMinor).toBe(0));
  it("charges nothing when optional surcharge is off", () => expect(travelEstimate(50, { ...settings, travel_surcharge_enabled: false }).feeMinor).toBe(0));
  it("rounds a partial interval up", () => expect(travelEstimate(40.1, settings).feeAED).toBe(100));
  it("uses fils for decimal tariffs", () => expect(travelEstimate(50, { ...settings, travel_fee_per_step: 10.15 }).feeMinor).toBe(2030));
  it("rejects invalid distances", () => expect(() => travelEstimate(-1, settings)).toThrow());
  it("does not infer distance from cities or performance duration", () => expect(clientTravelDistance(["Dubai to Abu Dhabi, 50 minutes"])).toBeNull());
  it("uses the latest explicit client distance", () => expect(clientTravelDistance(["Jarak: 50 km", "distance 80 km"])).toBe(80));
  it("keeps unknown travel distance out of payable estimates", () => expect(travelPrompt(settings, null)).toContain("No measured or client-supplied travel distance"));
});