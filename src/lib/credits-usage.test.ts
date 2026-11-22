import { describe, expect, it } from "vitest";
import { AED_PER_USD, aedOf, axisLabel, dayKey, estimateUsd, lastDays, modelColors, niceMax, sums, valueOf, type LedgerRow } from "./credits-usage";

const row = (o: Partial<LedgerRow> = {}): LedgerRow => ({ id: "1", created_at: "2026-11-20T10:00:00Z", delta: -1, reason: "ai_reply", model: "m", tokens_in: 1000, tokens_cached: 500, tokens_out: 200, cost_usd_micros: 2500, ...o });

describe("credit usage numbers", () => {
  it("turns micros into USD and AED", () => {
    expect(aedOf(row({ cost_usd_micros: 1_000_000 }))).toBeCloseTo(AED_PER_USD, 6);
    expect(aedOf(row({ cost_usd_micros: null }))).toBe(0);
  });
  it("sums replies, credits, tokens and cost", () => {
    const s = sums([row(), row({ delta: -1, tokens_in: null, tokens_cached: null, tokens_out: null, cost_usd_micros: null })]);
    expect(s).toMatchObject({ replies: 2, credits: 2, input: 1000, cached: 500, output: 200, tokens: 1700 });
    expect(s.usd).toBeCloseTo(0.0025, 6);
  });
  it("reads each metric", () => {
    const rows = [row(), row()];
    expect(valueOf(rows, "credits")).toBe(2);
    expect(valueOf(rows, "tokens")).toBe(3400);
    expect(valueOf(rows, "cost")).toBeCloseTo(2 * 0.0025 * AED_PER_USD, 6);
  });
  it("uses the Dubai day", () => {
    expect(dayKey("2026-11-20T21:30:00Z")).toBe("2026-11-21");
    expect(lastDays(3, new Date("2026-11-20T10:00:00Z"))).toEqual(["2026-11-18", "2026-11-19", "2026-11-20"]);
  });
  it("picks tidy axis values", () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(7)).toBe(8);
    expect(niceMax(130)).toBe(200);
    expect(axisLabel(1500, "tokens")).toBe("1.5k");
    expect(axisLabel(0.5, "cost")).toBe("0.50");
  });
  it("keeps one colour per model", () => {
    const c = modelColors(["b", "a", "b"]);
    expect(Object.keys(c)).toEqual(["a", "b"]);
    expect(c["a"]).not.toBe(c["b"]);
  });
  it("estimates cost with the standard formula", () => {
    expect(estimateUsd({ input: 1200, cached: 800, output: 300 }, { usd_in_per_mtok: 3, usd_cached_per_mtok: 0.3, usd_out_per_mtok: 15 })).toBeCloseTo(0.00834, 5);
  });
});
