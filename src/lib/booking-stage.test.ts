import { describe, expect, it } from "vitest";
import { bookingPay, bookingStage } from "./booking-stage";

const b = (status: string, total: number, paid: number, escrow = "none") => ({ status, total, paid_amount: paid, escrow_status: escrow });

describe("bookingStage", () => {
  it("is a soft booking until something is paid", () => {
    expect(bookingStage(b("inquiry", 1000, 0))).toBe("soft");
    expect(bookingStage(b("quoted", 1000, 0))).toBe("soft");
  });
  it("is a job booking once a down payment or the full amount is paid", () => {
    expect(bookingStage(b("confirmed", 1000, 300, "held"))).toBe("job");
    expect(bookingStage(b("confirmed", 1000, 1000, "held"))).toBe("job");
  });
  it("stays a job booking when completed but the money is not in the wallet yet", () => {
    expect(bookingStage(b("completed", 1000, 1000, "release_pending"))).toBe("job");
    expect(bookingStage(b("disputed", 1000, 1000, "held"))).toBe("job");
  });
  it("is complete only when the escrow is released", () => {
    expect(bookingStage(b("completed", 1000, 1000, "released"))).toBe("complete");
  });
  it("ignores cancelled bookings", () => {
    expect(bookingStage(b("cancelled", 1000, 500, "refunded"))).toBe("soft");
  });
});

describe("bookingPay", () => {
  it("reads the payment", () => {
    expect(bookingPay({ total: 1000, paid_amount: 0 })).toBe("unpaid");
    expect(bookingPay({ total: 1000, paid_amount: 300 })).toBe("partial");
    expect(bookingPay({ total: 1000, paid_amount: 1000 })).toBe("paid");
    expect(bookingPay({ total: "0", paid_amount: "0" })).toBe("unpaid");
  });
});
