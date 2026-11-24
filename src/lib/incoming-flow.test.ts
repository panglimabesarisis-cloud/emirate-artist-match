import { describe, expect, it } from "vitest";
import { incomingFlow, type FlowNode, type FlowEdge } from "./ai-flow";
import { agentModel } from "./agent-options";
const node = (id: string, type: FlowNode["type"]): FlowNode => ({ id, type, position: { x: 0, y: 0 }, data: { text: id } });
const nodes = [node("chat", "incoming_message"), node("form", "incoming_form"), node("calendar", "calendar"), node("greet", "message"), node("unconnected", "whatsapp")];
const edges: FlowEdge[] = [{ id: "1", source: "chat", target: "greet" }, { id: "2", source: "form", target: "calendar" }];
describe("incoming flow sources", () => {
  it("routes submitted artist forms only to their connected calendar path", () => {
    expect(incomingFlow(nodes, edges, "incoming_form").nodes.map(n => n.id)).toEqual(["form", "calendar"]);
  });
  it("routes artist profile chat only to its own connected greeting path", () => {
    expect(incomingFlow(nodes, edges, "incoming_message").nodes.map(n => n.id)).toEqual(["chat", "greet"]);
  });
  it("retains existing graphs when no matching trigger is saved", () => {
    const legacy = [node("start", "start")];
    expect(incomingFlow(legacy, [], "incoming_form")).toEqual({ nodes: legacy, edges: [], triggered: false });
  });
  it("resolves all three model presets without a subscription restriction", () => {
    expect([agentModel("fast"), agentModel("balanced"), agentModel("advanced")]).toEqual(["openai/gpt-5.4-mini", "openai/gpt-5.6-luna", "openai/gpt-5.5"]);
  });
});