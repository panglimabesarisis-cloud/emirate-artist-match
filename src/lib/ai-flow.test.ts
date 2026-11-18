import { describe, it, expect } from "vitest";
import { DEFAULT_FLOW, flowToPrompt, extractButtons, extractForm } from "./ai-flow";

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

describe("buttons", () => {
  it("tells the AI to show the button choices", () => {
    expect(flowToPrompt(DEFAULT_FLOW.nodes, DEFAULT_FLOW.edges)).toContain("[BUTTONS: Wedding | Corporate | Private party]");
  });
  it("routes each button to its own step", () => {
    const nodes = [
      { id: "a", type: "buttons" as const, position: { x: 0, y: 0 }, data: { text: "Pick", buttons: ["Yes", "No"] } },
      { id: "b", type: "message" as const, position: { x: 0, y: 0 }, data: { text: "Great" } },
    ];
    expect(flowToPrompt(nodes, [{ id: "e", source: "a", target: "b", sourceHandle: "b1" }])).toContain('"No" go to step 2');
  });
  it("splits buttons off the reply text", () => {
    expect(extractButtons("Which event?\n[BUTTONS: Wedding | Corporate]")).toEqual({ text: "Which event?", buttons: ["Wedding", "Corporate"] });
    expect(extractButtons("Hello").buttons).toEqual([]);
  });
});

describe("form", () => {
  const nodes = [{ id: "f", type: "form" as const, position: { x: 0, y: 0 }, data: { text: "Fill in", fields: [{ label: "Name", type: "text" as const, saveAs: "client_name" }, { label: "Email", type: "email" as const }] } }];
  it("tells the AI to show the form fields", () => {
    const p = flowToPrompt(nodes, []);
    expect(p).toContain("[FORM: Name:text | Email:email]");
    expect(p).toContain('remember "Name" as {client_name}');
  });
  it("splits the form off the reply text", () => {
    expect(extractForm("Details please\n[FORM: Name:text | Phone:phone]")).toEqual({ text: "Details please", fields: [{ label: "Name", type: "text" }, { label: "Phone", type: "phone" }] });
  });
});
