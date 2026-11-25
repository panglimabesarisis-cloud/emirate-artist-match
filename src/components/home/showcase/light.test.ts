import { describe, expect, it } from "vitest";
import { approach, edgeDistance, edgePoint, perimeter } from "./light";

const box = { width: 400, height: 200 };

describe("box edge light", () => {
  it("puts the light on the edge nearest to the pointer, inside or outside", () => {
    expect(edgePoint(edgeDistance(120, 10, box), box)).toMatchObject({ x: 120, y: 0, outY: -1 });
    expect(edgePoint(edgeDistance(390, 90, box), box)).toMatchObject({ x: 400, y: 90, outX: 1 });
    expect(edgePoint(edgeDistance(250, 260, box), box)).toMatchObject({ x: 250, y: 200, outY: 1 });
    expect(edgePoint(edgeDistance(-80, 70, box), box)).toMatchObject({ x: 0, y: 70, outX: -1 });
  });
  it("wraps distances around the whole box", () => {
    expect(perimeter(box)).toBe(1200);
    expect(edgePoint(1200 + 50, box)).toMatchObject({ x: 50, y: 0 });
    expect(edgePoint(-10, box)).toMatchObject({ x: 0, y: 10 });
  });
  it("travels the short way round", () => {
    expect(approach(20, 1180, 0.5, box)).toBeCloseTo(0, 5);
    expect(approach(1180, 20, 1, box)).toBeCloseTo(20, 5);
    expect(approach(100, 300, 0.25, box)).toBeCloseTo(150, 5);
  });
});
