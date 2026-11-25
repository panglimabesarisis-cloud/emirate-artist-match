/** WhatsApp steps of an AI flow: which ones the conversation has reached and what they say. */
import { extractButtons, extractForm, isNotice, whatsappEdges, type FlowEdge, type FlowNode } from "./ai-flow";
import { maskContacts } from "./masking";

type Message = { sender: string; body: string };
const normal = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The first step at or after `id` that the client sees, walking past WhatsApp steps. */
export function skipNotices(nodes: FlowNode[], edges: FlowEdge[], id: string | undefined): FlowNode | undefined {
  const seen = new Set<string>();
  let node = nodes.find(n => n.id === id);
  while (node && isNotice(node.type) && !seen.has(node.id)) {
    const current = node.id;
    seen.add(current);
    const next = edges.find(e => e.source === current)?.target;
    node = nodes.find(n => n.id === next);
  }
  return node;
}

/** An incoming trigger also counts as a start; the one nothing leads into comes first. */
const startNode = (nodes: FlowNode[], edges: FlowEdge[]) => {
  const root = (n: FlowNode) => !edges.some(e => e.target === n.id);
  return nodes.find(n => n.type === "start" && root(n)) ?? nodes.find(n => n.type === "start") ?? nodes.find(root) ?? nodes[0];
};

/** Only WhatsApp steps connected to the active flow may ever send. */
export function reachableNotices(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const start = startNode(nodes, edges);
  const queue = start ? [start.id] : [];
  const seen = new Set<string>();
  const found: FlowNode[] = [];
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const node = nodes.find(n => n.id === id);
    if (node && isNotice(node.type)) found.push(node);
    queue.push(...edges.filter(e => e.source === id).map(e => e.target));
  }
  return found;
}

/** Walks from the given steps through WhatsApp steps (and any step `through` allows). */
function collect(nodes: FlowNode[], edges: FlowEdge[], ids: string[], through: (node: FlowNode) => boolean = () => false) {
  const queue = [...ids];
  const seen = new Set<string>();
  const found: FlowNode[] = [];
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const node = nodes.find(n => n.id === id);
    if (!node || !(isNotice(node.type) || through(node))) continue;
    if (isNotice(node.type)) found.push(node);
    queue.push(...edges.filter(e => e.source === id).map(e => e.target));
  }
  return found;
}

/** The saved form or buttons card the client just answered, and the handle that answer takes. */
function answeredStep(nodes: FlowNode[], history: Message[]) {
  const last = history.at(-1);
  if (last?.sender !== "client") return null;
  const previous = history.slice(0, -1).reverse().find(m => m.sender === "ai");
  if (!previous) return null;
  const fields = extractForm(previous.body).fields;
  const choices = extractButtons(previous.body).buttons;
  const matches = nodes.filter(node => fields.length
    ? node.type === "form" && node.data.fields?.length === fields.length && node.data.fields.every((f, i) => normal(f.label) === normal(fields[i]?.label ?? ""))
    : choices.length ? node.type === "buttons" && node.data.buttons?.join("|") === choices.join("|")
    : node.type === "question" && normal(node.data.text) === normal(previous.body));
  const node = matches.length === 1 ? matches[0] : undefined;
  if (!node) return null;
  if (node.type === "form" && !node.data.fields?.every(f => fieldValue(last.body, f.label))) return null;
  if (node.type !== "buttons") return { node, handle: null };
  const index = node.data.buttons?.findIndex(b => normal(b) === normal(last.body)) ?? -1;
  return index < 0 ? null : { node, handle: `b${index}` };
}

/** WhatsApp steps that saved connections prove were reached, without asking the AI. */
export function passedNotices(nodes: FlowNode[], edges: FlowEdge[], history: Message[], firstReply: boolean): FlowNode[] {
  const answered = answeredStep(nodes, history);
  if (answered) {
    const outs = edges.filter(e => e.source === answered.node.id);
    const chosen = answered.handle ? outs.filter(e => e.sourceHandle === answered.handle) : outs;
    const taken = chosen.length ? chosen : outs.filter(e => !e.sourceHandle);
    return collect(nodes, edges, taken.map(e => e.target));
  }
  const start = startNode(nodes, edges);
  return firstReply && start ? collect(nodes, edges, [start.id], node => node.type === "start") : [];
}

/** WhatsApp steps directly on the branch a verified artist decision takes. */
export function decisionNotices(nodes: FlowNode[], edges: FlowEdge[], decision: "yes" | "no"): FlowNode[] {
  const routes = whatsappEdges(nodes, edges);
  const approvals = new Set(reachableApprovals(nodes, routes));
  return collect(nodes, routes, routes.filter(e => approvals.has(e.source) && e.sourceHandle === decision).map(e => e.target));
}

function reachableApprovals(nodes: FlowNode[], edges: FlowEdge[]) {
  const start = startNode(nodes, edges);
  const queue = start ? [start.id] : [];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (nodes.find(n => n.id === id)?.type === "whatsapp") return [id];
    queue.push(...edges.filter(e => e.source === id).map(e => e.target));
  }
  return [];
}

function fieldValue(body: string, label: string) {
  for (const line of body.split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0 && normal(line.slice(0, colon)) === normal(label)) {
      const value = line.slice(colon + 1).trim();
      if (value) return value;
    }
  }
  return "";
}

/** Saved answers read back from the chat: form fields, button choices and exact questions. */
export function capturedValues(nodes: FlowNode[], history: Message[], known: Record<string, string | number | null | undefined>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(known)) if (value !== null && value !== undefined && value !== "") values[name] = String(value);
  history.forEach((message, index) => {
    if (message.sender !== "client") return;
    for (const field of nodes.flatMap(n => n.data.fields ?? [])) {
      const value = field.saveAs ? fieldValue(message.body, field.label) : "";
      if (field.saveAs && value) values[field.saveAs] = value;
    }
    const answered = answeredStep(nodes, history.slice(0, index + 1));
    if (answered?.node.type !== "form" && answered?.node.data.saveAs) values[answered.node.data.saveAs] = message.body.trim();
  });
  return values;
}

/** The saved message with its {variables}; contact details never leave the platform. */
export function fillNotice(template: string, values: Record<string, string>): string {
  return maskContacts(template)
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_, name: string) => values[name] ? maskContacts(values[name]).slice(0, 500) : "-")
    .slice(0, 2000);
}

/** Reads the AI's send_whatsapp call; only a connected step and plain text values pass. */
export function noticeRequest(args: string, notices: FlowNode[]) {
  try {
    const parsed = JSON.parse(args) as { nodeId?: unknown; values?: unknown };
    const node = notices.find(n => n.id === parsed.nodeId);
    if (!node) return null;
    const values: Record<string, string> = {};
    for (const item of Array.isArray(parsed.values) ? parsed.values.slice(0, 30) : []) {
      const { name, value } = (item ?? {}) as { name?: unknown; value?: unknown };
      if (typeof name === "string" && typeof value === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) values[name] = value;
    }
    return { node, values };
  } catch { return null; }
}
