import { describe, expect, it } from "vitest";
import { ensureAgentButtons, reachableButtons } from "./agent-buttons";
import { extractButtons, type FlowNode } from "./ai-flow";

const jobs: FlowNode = { id: "jobs", type: "buttons", position: { x: 0, y: 0 }, data: { text: "What type of job are you looking for?", buttons: ["Emcee", "Standup", "Other"] } };
describe("saved AI Flow buttons", () => {
  it("renders the saved Emcee, Standup, Other choices after a selected tool call", () => {
    expect(extractButtons(ensureAgentButtons("Choose your job", [jobs], "jobs")).buttons).toEqual(["Emcee", "Standup", "Other"]);
  });
  it("repairs the reported merged job question without asking later event details", () => {
    const result = extractButtons(ensureAgentButtons("Thank you, Risyad. What type of job are you looking for—Emcee, Standup, or something else? Please also share the event date.", [jobs]));
    expect(result.buttons).toEqual(["Emcee", "Standup", "Other"]);
    expect(result.text).toBe("What type of job are you looking for?");
    const repaired = extractButtons(ensureAgentButtons("Emcee, Standup, or Other? Please also share the event date.", [jobs]));
    expect(repaired.buttons).toEqual(jobs.data.buttons);
    expect(repaired.text).toBe(jobs.data.text);
  });
  it("does not create choices during unrelated answers or artist approval", () => {
    expect(ensureAgentButtons("The artist performs in Dubai.", [jobs])).toBe("The artist performs in Dubai.");
    expect(ensureAgentButtons("[BOOKING_READY {}]", [jobs], "jobs")).toBe("[BOOKING_READY {}]");
  });
  it("excludes disconnected cards and rejects unknown IDs and invented options", () => {
    const start: FlowNode = { ...jobs, id: "start", type: "start", data: { text: "Hello" } };
    expect(reachableButtons([start, jobs], [])).toEqual([]);
    expect(reachableButtons([start, jobs], [{ id: "e", source: "start", target: "jobs" }])).toEqual([jobs]);
    expect(ensureAgentButtons("Hello", [jobs], "unknown")).toBe("Hello");
    expect(extractButtons(ensureAgentButtons("Choose\n[BUTTONS: Singer | DJ]", [jobs])).buttons).toEqual([]);
  });
  it("preserves a selected branch rather than displaying another branch", () => {
    const other: FlowNode = { ...jobs, id: "duration", data: { text: "Duration?", buttons: ["30 Minutes", "60 Minutes"] } };
    expect(extractButtons(ensureAgentButtons("Duration?", [jobs, other], "duration")).buttons).toEqual(["30 Minutes", "60 Minutes"]);
  });
  it("never adds buttons beside an interactive form", () => {
    expect(ensureAgentButtons("Details\n[FORM: Date:date]", [jobs], "jobs")).toBe("Details\n[FORM: Date:date]");
  });
});