import { describe, expect, it } from "vitest";
import { emptyRate, rateDraft, ratePayload, rateTotals, restoreRateDraft } from "./ratecard";

describe("dynamic ratecard rules", () => {
  const website = () => ({ ...emptyRate(), title: "Website", unit_label: "Pages", rules_of_work: "Includes 2 revisions. Hosting and domain excluded.", items: [{ desc: "Five pages", qty: "5", price: "4500", type: "base" as const, unit: "Pages" }, { desc: "Extra revision", qty: "1", price: "250", type: "addon" as const, unit: "Revisions" }] });
  it("stores scope price without multiplying by quantity", () => { expect(ratePayload(website()).price).toBe(4500); });
  it("excludes optional revision fees from the base package", () => { expect(rateTotals(website().items)).toEqual({ base: 4500, addons: 250 }); });
  it("does not assign performer minutes to pages", () => { expect(ratePayload(website()).duration_minutes).toBeNull(); });
  it("retains revisions and hosting exclusions", () => { expect(ratePayload(website()).rules_of_work).toBe("Includes 2 revisions. Hosting and domain excluded."); });
  it("preserves legacy 60-minute AED 5000 packages", () => { const p = rateDraft({ title: "MC", price: 5000, duration_minutes: 60, description: "Hosting" }); expect(ratePayload(p)).toMatchObject({ price: 5000, duration_minutes: 60 }); });
  it("restores old signup drafts without dropping scope or price", () => { expect(ratePayload(restoreRateDraft({ title: "MC", price: "5000", duration: "60", description: "Hosting" }))).toMatchObject({ price: 5000, duration_minutes: 60 }); });
  it("accepts custom units and keeps each item's unit", () => { const p = website(); p.unit_label = "m²"; const row = ratePayload(p); expect(row.unit_label).toBe("m²"); expect(row.items[1]?.unit).toBe("Revisions"); });
  it("rejects add-on-only packages", () => { const p = website(); p.items = p.items.filter(i => i.type === "addon"); expect(() => ratePayload(p)).toThrow(); });
  it("rejects zero quantity and negative prices", () => { const p = website(); const item = p.items[0]; if (!item) throw new Error("Missing fixture"); item.qty = "0"; expect(() => ratePayload(p)).toThrow(); item.qty = "5"; item.price = "-1"; expect(() => ratePayload(p)).toThrow(); });
  it("round-trips saved items and rules for dashboard and signup", () => { const row = ratePayload(website()); expect(ratePayload(rateDraft(row))).toEqual(row); });
});