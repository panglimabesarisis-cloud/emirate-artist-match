import { describe, expect, it } from "vitest";
import { activePurchase, addonProblem, addonTotalAed, EMPTY_ADDON, purchaseState } from "./addons";

const now = new Date("2026-11-26T00:00:00Z").getTime();
const buy = (expires_at: string | null, refunded_at: string | null = null, addon_id = "a") => ({ addon_id, expires_at, refunded_at });

describe("add-ons", () => {
  it("adds 5% VAT without rounding drift", () => {
    expect(addonTotalAed(50)).toBe(52.5);
    expect(addonTotalAed(19.99)).toBe(20.99);
  });
  it("reads a purchase as active, expired or refunded", () => {
    expect(purchaseState(buy(null), now)).toBe("active");
    expect(purchaseState(buy("2026-11-27T00:00:00Z"), now)).toBe("active");
    expect(purchaseState(buy("2026-11-26T00:00:00Z"), now)).toBe("expired");
    expect(purchaseState(buy(null, "2026-11-01T00:00:00Z"), now)).toBe("refunded");
  });
  it("keeps the active purchase that lasts longest", () => {
    const rows = [buy("2026-12-01T00:00:00Z"), buy("2027-01-01T00:00:00Z"), buy("2028-01-01T00:00:00Z", "2026-11-02T00:00:00Z"), buy(null, null, "b")];
    expect(activePurchase(rows, "a", now)).toBe(rows[1]);
    expect(activePurchase(rows, "c", now)).toBeNull();
  });
  it("refuses an incomplete add-on", () => {
    const ok = { ...EMPTY_ADDON, name: "AI agent page", description: "A private page for your agent.", price: "50" };
    expect(addonProblem(ok)).toBeNull();
    for (const bad of [{ name: "AI" }, { description: "short" }, { price: "0" }, { price: "1.234" }, { price: "abc" }]) expect(addonProblem({ ...ok, ...bad })).toBeTruthy();
  });
});
