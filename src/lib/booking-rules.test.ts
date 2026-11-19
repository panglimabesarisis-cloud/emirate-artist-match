import { describe, it, expect } from "vitest";
import { priceBreakdown, refundAmount, canComplete } from "./booking-rules";

const now = new Date("2026-11-18T10:00:00Z");
describe("booking rules", () => {
  it("adds 5% VAT", () => expect(priceBreakdown(2000)).toEqual({ subtotal: 2000, vat: 100, total: 2100 }));
  it("client cancelling 14+ days before gets full refund", () => expect(refundAmount(2100, "client", "2026-12-02", now)).toBe(2100));
  it("client cancelling 7-13 days before gets 50%", () => expect(refundAmount(2100, "client", "2026-11-25", now)).toBe(1050));
  it("client cancelling under 7 days gets nothing", () => expect(refundAmount(2100, "client", "2026-11-24", now)).toBe(0));
  it("artist cancelling always refunds fully", () => expect(refundAmount(2100, "artist", "2026-11-19", now)).toBe(2100));
  it("cannot complete before the event date", () => {
    expect(canComplete("confirmed", "2026-11-19", now)).toBe(false);
    expect(canComplete("confirmed", "2026-11-18", now)).toBe(true);
    expect(canComplete("quoted", "2026-11-10", now)).toBe(false);
  });
});

import { canDispute, extractDraft } from "./booking-rules";
describe("disputes and AI drafts", () => {
  it("disputes allowed while paid or during the 48h hold", () => {
    expect(canDispute("confirmed", "held")).toBe(true);
    expect(canDispute("completed", "release_pending")).toBe(true);
    expect(canDispute("completed", "released")).toBe(false);
    expect(canDispute("quoted", "none")).toBe(false);
  });
  it("parses the AI booking-ready token", () => {
    const r = extractDraft('Great, sending to the artist. [BOOKING_READY {"title":"Gold set","amount":2500,"date":"2026-12-20","notes":"JBR villa, 80 guests"}]');
    expect(r.text).toBe("Great, sending to the artist.");
    expect(r.draft).toEqual({ title: "Gold set", amount: 2500, date: "2026-12-20", notes: "JBR villa, 80 guests" });
  });
  it("ignores an invalid draft", () => expect(extractDraft('ok [BOOKING_READY {"amount":0}]').draft).toBeNull());
});

it("preserves client job details from direct chat",()=>{expect(extractDraft('[BOOKING_READY {"title":"DJ","amount":1,"date":"2026-12-20","notes":"Wedding","clientName":"Alex","jobDetail":"Outdoor wedding, 80 guests, 18:00–20:00"}]').draft?.jobDetail).toBe("Outdoor wedding, 80 guests, 18:00–20:00");});
