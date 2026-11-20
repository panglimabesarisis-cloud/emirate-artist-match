import { describe, expect, it } from "vitest";
import { ensureAgentForm, formToken, nextSavedForm, reachableForms } from "./agent-forms";
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
  it("preserves saved dropdown choices and variables through the chat protocol", () => {
    const fields = [{ label: "Service", type: "dropdown" as const, options: ["Emcee", "DJ"], saveAs: "service" }];
    expect(extractForm(formToken(fields)).fields).toEqual(fields);
  });
  it("uses the booking event catalog for event_type even in older text fields", () => {
    expect(extractForm(formToken([{ label: "Event", type: "text", saveAs: "event_type" }])).fields).toEqual([{ label: "Event", type: "dropdown", saveAs: "event_type", source: "event_types" }]);
  });
  it("resolves the selected button to its complete saved form", () => {
    const choice: FlowNode = { id: "choice", type: "buttons", position: { x: 0, y: 0 }, data: { text: "Ready?", buttons: ["Yes", "No"] } };
    const edges = [{ id: "yes", source: "choice", target: form.id, sourceHandle: "b0" }];
    expect(nextSavedForm([choice, form], edges, [{ sender: "ai", body: "Ready?\n[BUTTONS: Yes | No]" }, { sender: "client", body: "Yes" }])?.id).toBe("event");
    expect(nextSavedForm([choice, form], edges, [{ sender: "ai", body: "Ready?\n[BUTTONS: Yes | No]" }, { sender: "client", body: "No" }])).toBeUndefined();
  });
  it("keeps a multi-field form active until submitted together", () => {
    expect(nextSavedForm([form], [], [{ sender: "ai", body: formToken(form.data.fields ?? []) }, { sender: "client", body: "Event date: 2026-12-20" }])?.id).toBe("event");
  });
  it("collects the saved schedule form before a Calendar placed ahead of its hours", () => {
    const date: FlowNode = { ...form, id: "date", data: { text: "Date", fields: [{ label: "Event date", type: "date" }] } };
    const calendar: FlowNode = { id: "calendar", type: "calendar", position: { x: 0, y: 0 }, data: { text: "Check schedule" } };
    const schedule: FlowNode = { ...form, id: "schedule", data: { text: "Schedule", fields: [{ label: "Event Type", type: "text", saveAs: "event_type" }, { label: "Start Time", type: "time", saveAs: "start_time" }, { label: "End Time", type: "time", saveAs: "end_time" }] } };
    const edges = [{ id: "1", source: "date", target: "calendar" }, { id: "2", source: "calendar", target: "schedule", sourceHandle: "yes" }];
    expect(nextSavedForm([date, calendar, schedule], edges, [{ sender: "ai", body: formToken(date.data.fields ?? []) }, { sender: "client", body: "Event date: 2026-12-20" }])?.id).toBe("schedule");
  });
});