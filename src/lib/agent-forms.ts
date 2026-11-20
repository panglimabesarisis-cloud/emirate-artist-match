import { extractForm, type FlowNode, type FlowEdge, type FormField } from "./ai-flow";

type Message = { sender: string; body: string };
const normal = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function formToken(fields: FormField[]) {
  return `[FORM: ${fields.slice(0, 8).map(field => `${field.label.replace(/[\[\]|:]/g, " ").trim()}:${field.type}`).join(" | ")}]`;
}

/** Restrict UI forms to reachable saved nodes; never accept client-defined fields. */
export function reachableForms(nodes: FlowNode[], edges: FlowEdge[]) {
  const start = nodes.find(node => node.type === "start") ?? nodes.find(node => !edges.some(edge => edge.target === node.id)) ?? nodes[0];
  const queue = start ? [start.id] : [];
  const seen = new Set<string>();
  const forms: FlowNode[] = [];
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const node = nodes.find(candidate => candidate.id === id);
    if (node?.type === "form" && node.data.fields?.length) forms.push(node);
    queue.push(...edges.filter(edge => edge.source === id).map(edge => edge.target));
  }
  return forms;
}

/** Repair omitted form markers only with evidence of the current form, not by BFS order. */
export function ensureAgentForm(text: string, forms: FlowNode[], history: Message[], requestedId?: string) {
  if (/\[(?:HANDOVER|BOOKING_READY)\b/.test(text)) return text;
  const submitted = (node: FlowNode) => history.some(message => message.sender === "client" &&
    node.data.fields?.every(field => message.body.split("\n").some(line => {
      const colon = line.indexOf(":");
      return colon > 0 && normal(line.slice(0, colon)) === normal(field.label) && Boolean(line.slice(colon + 1).trim());
    })));
  const parsed = extractForm(text);
  const candidates = forms.filter(node => !submitted(node));
  let node = requestedId ? candidates.find(candidate => candidate.id === requestedId) : undefined;
  if (!node && parsed.fields.length) node = candidates.find(candidate => candidate.data.fields?.every(field => parsed.fields.some(item => normal(item.label) === normal(field.label))));
  if (!node && !parsed.fields.length) {
    const matches = candidates.filter(candidate => {
      const fields = candidate.data.fields ?? [];
      // A plain question list is evidence; incidental mentions in an answer are not.
      const labels = text.split("\n").filter(line => /:\s*$/.test(line)).map(line => normal(line.replace(/^[-*\d.\s]+/, "")));
      return fields.length > 0 && fields.every(field => labels.includes(normal(field.label)));
    });
    if (matches.length === 1) node = matches[0];
  }
  if (!node?.data.fields?.length) return parsed.fields.length ? parsed.text : text;
  const labels = node.data.fields.map(field => normal(field.label));
  const intro = parsed.text.split("\n").filter(line => !labels.includes(normal(line.replace(/^[-*\d.\s]+/, "")))).join("\n").trim();
  return `${intro}\n${formToken(node.data.fields)}`.trim();
}