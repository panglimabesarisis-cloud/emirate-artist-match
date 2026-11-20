import { extractButtons, extractForm, interactiveFields, type FlowNode, type FlowEdge, type FormField } from "./ai-flow";

type Message = { sender: string; body: string };
const normal = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function formToken(fields: FormField[]) {
  fields = interactiveFields(fields.slice(0, 8));
  if (fields.some(field => field.type === "dropdown" || field.saveAs)) return `[FORM_DATA: ${encodeURIComponent(JSON.stringify(fields))}]`;
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
  if (requestedId) return `Please fill in the following details.\n${formToken(node.data.fields)}`;
  const labels = node.data.fields.map(field => normal(field.label));
  const intro = parsed.text.split("\n").filter(line => !labels.includes(normal(line.replace(/^[-*\d.\s]+/, "")))).join("\n").trim();
  return `${intro}\n${formToken(node.data.fields)}`.trim();
}
/** Resolve only the displayed step and its saved edge, never an unchosen branch. */
export function nextSavedForm(nodes: FlowNode[], edges: FlowEdge[], history: Message[]) {
  let lastClient = history.length - 1;
  while (lastClient >= 0 && history[lastClient]?.sender !== "client") lastClient--;
  if (lastClient < 0) return undefined;
  const client = history[lastClient];
  const previous = history.slice(0, lastClient).reverse().find(message => message.sender === "ai");
  if (!client || !previous) return undefined;
  const displayed = extractForm(previous.body).fields;
  const buttons = extractButtons(previous.body).buttons;
  const matches = nodes.filter(node => displayed.length
    ? node.type === "form" && node.data.fields?.length === displayed.length && node.data.fields.every((field, i) => normal(field.label) === normal(displayed[i]?.label ?? ""))
    : buttons.length ? node.type === "buttons" && node.data.buttons?.join("|") === buttons.join("|")
    : node.type === "question" && normal(node.data.text) === normal(previous.body));
  if (matches.length !== 1) return undefined;
  const current = matches[0];
  if (!current) return undefined;
  if (displayed.length && !current.data.fields?.every(field => client.body.split("\n").some(line => line.indexOf(":") > 0 && normal(line.split(":")[0] ?? "") === normal(field.label) && Boolean(line.slice(line.indexOf(":") + 1).trim())))) return current;
  const index = current.data.buttons?.findIndex(button => normal(button) === normal(client.body)) ?? -1;
  if (current.type === "buttons" && index < 0) return undefined;
  const outs = edges.filter(edge => edge.source === current.id && (current.type !== "buttons" || edge.sourceHandle === `b${index}` || !edge.sourceHandle));
  if (outs.length !== 1) return undefined;
  const next = nodes.find(node => node.id === outs[0]?.target);
  if (next?.type === "calendar") {
    const timingForms = reachableForms([next, ...nodes.filter(node => node.id !== next.id && node.type !== "start")], edges.filter(edge => edge.target !== next.id)).filter(node => node.data.fields?.some(field => field.saveAs === "start_time") && node.data.fields.some(field => field.saveAs === "end_time"));
    const hasTiming = history.some(message => message.sender === "client" && timingForms.some(node => node.data.fields?.filter(field => field.saveAs === "start_time" || field.saveAs === "end_time").every(field => message.body.split("\n").some(line => normal(line.split(":")[0] ?? "") === normal(field.label) && Boolean(line.slice(line.indexOf(":") + 1).trim())))));
    if (!hasTiming && timingForms.length === 1) return timingForms[0];
  }
  return next?.type === "form" && next.data.fields?.length ? next : undefined;
}
