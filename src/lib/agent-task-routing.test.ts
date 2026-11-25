import { describe, expect, it } from "vitest";
import { agentTaskModel, artistAgentModel } from "./agent-task-routing";

describe("artist model choice", () => {
  const greeting = { text: "Hi!", privateAgent: false };
  it("uses the card the artist saved, whatever the task", () => {
    expect(artistAgentModel("advanced", greeting)).toBe("openai/gpt-6-astra");
    expect(artistAgentModel("balanced", greeting)).toBe("openai/gpt-5.6-luna");
    expect(artistAgentModel("fast", { text: "Are you available for my booking?", privateAgent: false })).toBe("openai/gpt-5.4-mini");
  });
  it("routes by task when the choice is automatic or a legacy model id", () => {
    for (const choice of [null, undefined, "", "openai/gpt-5.5", "toString"]) expect(artistAgentModel(choice, greeting)).toBe("openai/gpt-5.4-mini");
  });
});

describe("automatic task model routing", () => {
  it("uses Fast for a greeting", () => {
    expect(agentTaskModel({ text: "Hi!", privateAgent: false })).toBe("openai/gpt-5.4-mini");
  });
  it("uses Fast for simple general FAQ without pending booking context", () => {
    expect(agentTaskModel({ text: "Are you an AI?", privateAgent: false })).toBe("openai/gpt-5.4-mini");
  });
  it("uses Balanced for client booking and calendar questions", () => {
    expect(agentTaskModel({ text: "Are you available for my booking?", privateAgent: false })).toBe("openai/gpt-5.6-luna");
  });
  it("uses Advanced for private invoice proposals", () => {
    expect(agentTaskModel({ text: "Buat invoice", privateAgent: true })).toBe("openai/gpt-6-astra");
  });
  it("uses Advanced for private artist analytics", () => {
    expect(agentTaskModel({ text: "Show my performance report as a table", privateAgent: true })).toBe("openai/gpt-6-astra");
  });
  it("keeps attachments and pending proposals on Advanced", () => {
    expect(agentTaskModel({ text: "yes", privateAgent: true, hasPendingActions: true })).toBe("openai/gpt-6-astra");
    expect(agentTaskModel({ text: "Hi", privateAgent: true, hasAttachments: true })).toBe("openai/gpt-6-astra");
  });
});