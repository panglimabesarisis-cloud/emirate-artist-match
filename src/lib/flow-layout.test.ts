import { describe, expect, it } from "vitest";
import { DEFAULT_FLOW } from "./ai-flow";
import { tidyLayout } from "./flow-layout";

const overlaps = (positions: { x: number; y: number }[]) => positions.some((a, i) => positions.slice(i + 1).some(b => Math.abs(a.x - b.x) < 224 && Math.abs(a.y - b.y) < 170));

describe("tidy flow layout", () => {
  const items = [...DEFAULT_FLOW.nodes.map(n => ({ id: n.id, position: { x: 0, y: 0 }, height: 170 })), { id: "facts", position: { x: 0, y: 0 }, height: 170 }];

  it("places every card without covering another, parents above children", () => {
    const placed = tidyLayout(items, DEFAULT_FLOW.edges);
    expect(placed.size).toBe(items.length);
    expect(overlaps([...placed.values()])).toBe(false);
    for (const edge of DEFAULT_FLOW.edges) expect(placed.get(edge.target)!.y).toBeGreaterThan(placed.get(edge.source)!.y);
  });

  it("finishes when the flow loops back", () => {
    const placed = tidyLayout(items, [...DEFAULT_FLOW.edges, { source: "neg", target: "pkg" }, { source: "pkg", target: "pkg" }]);
    expect(overlaps([...placed.values()])).toBe(false);
  });
});
