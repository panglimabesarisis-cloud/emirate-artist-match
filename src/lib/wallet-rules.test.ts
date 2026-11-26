import { describe, expect, it } from "vitest";
import { walletShare } from "./wallet-rules";

const booking = { status: "completed", escrow_status: "released", amount: 1000, vat_amount: 50, total: 1050, paid_amount: 1050, refund_amount: 0 };

describe("wallet share", () => {
  it("matches the database for released, refunded and deposit-only bookings", () => {
    expect(walletShare(booking, 20)).toEqual({ state: "ready", gross: 1000, fee: 200, net: 800 });
    expect(walletShare({ ...booking, escrow_status: "partially_refunded", refund_amount: 525 }, 20)).toMatchObject({ state: "ready", gross: 500 });
    expect(walletShare({ ...booking, paid_amount: 210 }, 20)).toMatchObject({ state: "ready", gross: 200 });
  });
  it("holds money until a completed job is released", () => {
    expect(walletShare({ ...booking, escrow_status: "release_pending" }, 20).state).toBe("review");
    expect(walletShare({ ...booking, escrow_status: "none" }, 20).state).toBe("escrow");
    expect(walletShare({ ...booking, status: "confirmed", escrow_status: "held" }, 20).state).toBe("escrow");
    expect(walletShare({ ...booking, paid_amount: 0 }, 20)).toMatchObject({ state: "awaiting", gross: 1000 });
  });
});
