import type { FlowNode, FlowEdge } from "./ai-flow";

export type TemplateFlow = { nodes: FlowNode[]; edges: FlowEdge[] };
/** A template is a snapshot, never a live reference to another artist's settings. */
export function copyTemplate(flow: TemplateFlow): TemplateFlow {
  const copy = structuredClone(flow);
  for (const node of copy.nodes) {
    if (node.type === "whatsapp" || node.type === "wa_assistant") node.data.destinationPhone = "";
  }
  return copy;
}