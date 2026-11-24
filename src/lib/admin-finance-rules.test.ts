import { describe, expect, it } from "vitest";
import { adminAllocation } from "./admin-finance-rules";

describe("admin agreement allocation", () => {
  it("funds AED 200 client commission from the AED 1000 fee, not the AED 9000 artist share", () => {
    expect(adminAllocation(10000, 10, 200)).toEqual({ artist: 9000, fee: 1000, client: 200, retained: 800, shortfall: 0 });
  });
  it("uses the eligible post-refund value without changing either rate", () => {
    expect(adminAllocation(5000, 10, 100)).toEqual({ artist: 4500, fee: 500, client: 100, retained: 400, shortfall: 0 });
  });
  it("reverses all allocations on a fully refunded booking", () => {
    expect(adminAllocation(10000, 10, 200, true)).toEqual({ artist: 0, fee: 0, client: 0, retained: 0, shortfall: 0 });
  });
  it("does not invent an artist rate for legacy bookings", () => {
    expect(adminAllocation(10000, null, 200).artist).toBeNull();
  });
  it("reports insufficient platform fee without charging the artist extra", () => {
    expect(adminAllocation(10000, 1, 200)).toEqual({ artist: 9900, fee: 100, client: 200, retained: -100, shortfall: 100 });
  });
});