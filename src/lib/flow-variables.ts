import { cardTitle, FLOW_VARIABLES, type FlowNode } from "./ai-flow";

export function normalizeFlowVariable(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9_\s-]/g, "").replace(/[\s-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
}

export function validFlowVariable(name: string): boolean {
  return /^[a-z][a-z0-9_]{0,63}$/.test(name) && name !== "none";
}

/** Answers this flow already collects from the conversation, with the card that collects each. */
export function capturedVariables(nodes: Pick<FlowNode, "type" | "data">[]): { name: string; from: string }[] {
  const found = new Map<string, string>();
  for (const node of nodes) {
    for (const name of [node.data.saveAs, ...(node.data.fields ?? []).map(f => f.saveAs)]) {
      if (name && !found.has(name)) found.set(name, cardTitle(node));
    }
  }
  return [...found].map(([name, from]) => ({ name, from }));
}

/** Saved node/field names are the catalog, so copies and reloads preserve custom variables. */
export function collectFlowVariables(nodes: Pick<FlowNode, "data">[]): string[] {
  return [...new Set([...FLOW_VARIABLES, ...nodes.flatMap(({ data }) => [data.saveAs, ...(data.fields ?? []).map(f => f.saveAs)]).filter((name): name is string => Boolean(name))])];
}