import { describe, it, expect } from "vitest";
import { DEFAULT_FLOW, flowToPrompt } from "./ai-flow";

describe("flowToPrompt", () => {
  it("starts with the greeting step", () => {
    expect(flowToPrompt(DEFAULT_FLOW.nodes, DEFAULT_FLOW.edges).split("\n")[0]).toMatch(/^1\. \[Greeting\]/);
  });
  it("writes yes/no branches for conditions", () => {
    const p = flowToPrompt(DEFAULT_FLOW.nodes, DEFAULT_FLOW.edges);
    expect(p).toMatch(/\[Condition\].*if yes go to step \d+; if no go to step \d+/);
  });
  it("returns empty text for an empty flow", () => {
    expect(flowToPrompt([], [])).toBe("");
  });
});
