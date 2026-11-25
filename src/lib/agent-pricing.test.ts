import { describe, expect, it } from "vitest";
import { agentRates, negotiationFloor, rangeNote } from "./agent-pricing";

describe("AI booking rate fallback", () => {
  it("uses the stored AED 5000 starting rate when Dede has no rate cards", () => {
    expect(agentRates([], 5000)).toMatchObject({ startingOnly: true, minimum: 5000 });
  });
  it("keeps package rates authoritative when they exist", () => {
    expect(agentRates([{ title: "Set", price: 2500, duration_minutes: 60, description: null }], 5000)).toMatchObject({ startingOnly: false, minimum: 2500 });
  });
  it("does not invent an amount when no valid price exists", () => {
    expect(agentRates([], 0).minimum).toBeNull();
    expect(agentRates([], Infinity).minimum).toBeNull();
  });
});

const card = (price: number, low?: number | null, high?: number | null) =>
  ({ title: "Set", price, duration_minutes: 60, description: null, price_low: low ?? null, price_high: high ?? null });

describe("negotiation floor", () => {
  it("uses the artist's own lowest price instead of the plan discount", () => {
    expect(negotiationFloor([card(1500, 1000)], null, 10)).toBe(1000);
  });
  it("falls back to the discount limit when no lowest price is set", () => {
    expect(negotiationFloor([card(1500)], null, 10)).toBe(1350);
  });
  it("takes the lowest floor across packages", () => {
    expect(negotiationFloor([card(5000, 4000), card(1500)], null, 10)).toBe(1350);
  });
  it("never discounts a starting rate with no packages", () => {
    expect(negotiationFloor([], 5000, 10)).toBe(5000);
  });
  it("refuses to invent a floor when there is no price at all", () => {
    expect(negotiationFloor([], 0, 10)).toBe(Infinity);
  });
  it("honours a zero floor as a real decision, not a missing value", () => {
    expect(negotiationFloor([card(1500, 0)], null, 10)).toBe(0);
  });
});

describe("negotiation range shown to the agent", () => {
  it("says nothing when the artist set no bounds", () => {
    expect(rangeNote(card(1500))).toBe("");
  });
  it("names the anchor, the target and the floor", () => {
    expect(rangeNote(card(1500, 1000, 2000))).toContain("open near AED 2,000");
    expect(rangeNote(card(1500, 1000, 2000))).toContain("aim for AED 1,500");
    expect(rangeNote(card(1500, 1000, 2000))).toContain("never below AED 1,000");
  });
});
