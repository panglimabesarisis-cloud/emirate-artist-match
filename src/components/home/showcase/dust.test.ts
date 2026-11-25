import { describe, expect, it } from "vitest";
import { grainAt, touchProgress } from "./dust";

describe("teaser dust", () => {
  it("starts when the panel touches the text and finishes once it has pushed past", () => {
    expect(touchProgress(500, 200, 300)).toBe(0);
    expect(touchProgress(300, 200, 300)).toBe(0);
    expect(touchProgress(215, 200, 300)).toBeCloseTo(0.5, 5);
    expect(touchProgress(0, 200, 300)).toBe(1);
  });
  it("lets each grain wait its turn, then fade as it flies", () => {
    expect(grainAt(0.1, 0.3)).toEqual({ flight: 0, alpha: 1 });
    const half = grainAt(0.65, 0.3);
    expect(half.flight).toBeCloseTo(0.5, 5);
    expect(half.alpha).toBeLessThan(1);
    expect(grainAt(1, 0.3).alpha).toBe(0);
  });
});
