import { describe, expect, it } from "vitest";
import { ensureAgentForm, reachableForms } from "./agent-forms";
import { extractForm, type FlowNode } from "./ai-flow";

const form: FlowNode = { id: "event", type: "form", position: { x: 0, y: 0 }, data: { text: "Event details", fields: [{ label: "Event date", type: "date" }, { label: "Special requests", type: "textarea" }] } };
describe("saved interactive agent forms", () => {
  it("renders saved date and textarea fields even when the AI only writes an introduction", () => {
    expect(extractForm(ensureAgentForm("Please share event details", [form], [], "event")).fields).toEqual(form.data.fields);
  });
  it("repairs a plain field list without displaying duplicate questions", () => {
    const result = extractForm(ensureAgentForm("Details please:\nEvent date:\nSpecial requests:", [form], []));
    expect(result.fields).toEqual(form.data.fields);
    expect(result.text).toBe("Details please:");
  });
  it("does not skip a form just because the client already gave a name", () => {
    expect(extractForm(ensureAgentForm("Details", [form], [{ sender: "client", body: "My name is Risyad" }], "event")).fields).toHaveLength(2);
  });
  it("does not repeat a fully submitted form", () => {
    expect(extractForm(ensureAgentForm("Thanks", [form], [{ sender: "client", body: "Event date: 2026-12-20\nSpecial requests: None" }], "event")).fields).toHaveLength(0);
  });
  it("does not display a form during unrelated answers or approval actions", () => {
    expect(ensureAgentForm("The artist performs in Dubai.", [form], [])).toBe("The artist performs in Dubai.");
    expect(ensureAgentForm("[HANDOVER]", [form], [], "event")).toBe("[HANDOVER]");
  });
  it("excludes disconnected forms and rejects unknown form IDs", () => {
    const start: FlowNode = { id: "start", type: "start", position: { x: 0, y: 0 }, data: { text: "Hello" } };
    expect(reachableForms([start, form], [])).toEqual([]);
    expect(ensureAgentForm("Hello", [form], [], "unknown")).toBe("Hello");
  });
  it("preserves the selected form instead of choosing another reachable branch", () => {
    const other: FlowNode = { ...form, id: "other", data: { text: "Other", fields: [{ label: "Guests", type: "number" }] } };
    expect(extractForm(ensureAgentForm("Details", [form, other], [], "other")).fields).toEqual(other.data.fields);
  });
});