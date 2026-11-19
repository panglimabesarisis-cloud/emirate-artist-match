import { describe, expect, it } from "vitest";
import { agentRates } from "./agent-pricing";

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