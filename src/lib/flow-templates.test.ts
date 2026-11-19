import { describe, expect, it } from "vitest";
import { copyTemplate } from "./flow-templates";
import type { TemplateFlow } from "./flow-templates";

describe("flow templates", () => {
  const source: TemplateFlow = { nodes: [{ id: "approval", type: "whatsapp", position: { x: 0, y: 0 }, data: { text: "Approve", destinationPhone: "+971501234567" } }], edges: [] };
  it("uses the artist's saved destination instead of the template creator's phone", () => {
    expect(copyTemplate(source).nodes[0]?.data.destinationPhone).toBe("");
    expect(source.nodes[0]?.data.destinationPhone).toBe("+971501234567");
  });
  it("keeps artist edits independent of the master template", () => {
    const copy = copyTemplate(source);
    const node = copy.nodes[0];
    if (node) node.data.text = "Changed";
    expect(source.nodes[0]?.data.text).toBe("Approve");
  });
});