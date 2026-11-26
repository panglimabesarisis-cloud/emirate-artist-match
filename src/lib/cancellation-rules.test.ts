import { describe, expect, it } from "vitest";
import { cancellationBlock, suggestedRefund } from "./cancellation-rules";

const now = new Date("2026-11-01T08:00:00Z");

describe("cancellation requests", () => {
  it("are closed within 7 days of the event and for finished bookings", () => {
    expect(cancellationBlock("confirmed", "2026-11-08", now)).toMatch(/within 7 days/);
    expect(cancellationBlock("confirmed", "2026-11-09", now)).toBeNull();
    expect(cancellationBlock("completed", "2026-12-30", now)).toMatch(/cannot be cancelled/);
  });
  it("suggests all of the payment two weeks ahead and half between 8 and 13 days", () => {
    expect([suggestedRefund(1050, "2026-11-20", now), suggestedRefund(1050, "2026-11-10", now), suggestedRefund(1050, "2026-11-05", now)]).toEqual([1050, 525, 0]);
  });
});
