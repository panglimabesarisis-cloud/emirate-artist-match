import { describe, expect, it } from "vitest";
import { finalAgentTaskCost, agentTaskCredits, assertAgentTaskContext } from "./agent-task-cost";

describe("AI task final cost", () => {
  it("adds 40% to actual task cost", () => { expect(finalAgentTaskCost(10000)).toBe(14000); });
  it("does not invent a price without usage cost", () => { expect(finalAgentTaskCost(null)).toBeNull(); });
  it("values one artist credit at AED 0.49", () => { expect(agentTaskCredits(10000)).toBe(0.104929); });
  it("rejects oversized requests rather than billing long context at standard rates", () => {
    expect(() => assertAgentTaskContext("a".repeat(240001), "", [])).toThrow();
    expect(() => assertAgentTaskContext("Hi", "Reply briefly", [])).not.toThrow();
  });
});