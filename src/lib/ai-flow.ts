/** Visual AI flow: shared types, default master template, and conversion to agent instructions. */
export type FlowKind = "start" | "message" | "question" | "buttons" | "calendar" | "package" | "condition" | "negotiate" | "handover" | "booking";
export type UrlButton = { label: string; url: string };
export type FlowData = { text: string; buttons?: string[]; urlButtons?: UrlButton[]; saveAs?: string };
/** Variables a step can save the client's answer into; usable later as {name} in any step. */
export const FLOW_VARIABLES = ["client_name", "event_type", "event_date", "start_time", "end_time", "guest_count", "budget", "venue_area", "package"];
export type FlowNode = { id: string; type: FlowKind; position: { x: number; y: number }; data: FlowData };
export type FlowEdge = { id: string; source: string; target: string; sourceHandle?: string | null };

export type FlowGroup = "Send" | "Ask" | "Logic" | "Actions";
export const FLOW_KINDS: { kind: FlowKind; label: string; hint: string; placeholder: string; group: FlowGroup; color: string }[] = [
  { kind: "start", label: "Greeting", hint: "Opening message", placeholder: "Welcome the client warmly and introduce yourself as the AI assistant.", group: "Send", color: "--chart-1" },
  { kind: "message", label: "Send message", hint: "Say something", placeholder: "Tell the client the artist performs across all seven emirates.", group: "Send", color: "--chart-1" },
  { kind: "question", label: "Ask question", hint: "Collect a detail", placeholder: "Ask for the event date and start/end time.", group: "Ask", color: "--chart-2" },
  { kind: "buttons", label: "Buttons", hint: "Quick-reply choices", placeholder: "Ask what type of event it is.", group: "Ask", color: "--chart-2" },
  { kind: "calendar", label: "Connect calendar", hint: "Check availability", placeholder: "Check the requested date against the artist's calendar and blocked dates.", group: "Actions", color: "--chart-4" },
  { kind: "package", label: "Offer package", hint: "Recommend from rate card", placeholder: "Recommend the best-fitting package with its price.", group: "Actions", color: "--chart-4" },
  { kind: "condition", label: "Condition", hint: "Yes / No branch", placeholder: "Is the client's budget at least the cheapest package?", group: "Logic", color: "--chart-3" },
  { kind: "negotiate", label: "Negotiate", hint: "Discount rules", placeholder: "Offer a small discount within the allowed limit if the client hesitates.", group: "Logic", color: "--chart-3" },
  { kind: "handover", label: "Hand over", hint: "Pass to the artist", placeholder: "Hand the conversation to the artist.", group: "Actions", color: "--chart-5" },
  { kind: "booking", label: "Booking ready", hint: "Send for approval", placeholder: "Summarise the agreed details and send them for artist approval.", group: "Actions", color: "--chart-5" },
];
export const FLOW_GROUPS: FlowGroup[] = ["Send", "Ask", "Logic", "Actions"];
export const kindColor = (k: FlowKind) => FLOW_KINDS.find((f) => f.kind === k)?.color ?? "--primary";

/** AI replies may end with [BUTTONS: A | B]; the chat shows them as tappable quick replies. */
export function extractButtons(body: string): { text: string; buttons: string[] } {
  const m = body.match(/\[BUTTONS:\s*([^\]]*)\]\s*$/);
  if (!m) return { text: body, buttons: [] };
  const buttons = (m[1] ?? "").split("|").map((b) => b.trim()).filter(Boolean).slice(0, 6);
  return { text: body.slice(0, m.index).trimEnd(), buttons };
}
export const kindLabel = (k: FlowKind) => FLOW_KINDS.find((f) => f.kind === k)?.label ?? k;

const n = (id: string, type: FlowKind, y: number, text: string, x = 250): FlowNode => ({ id, type, position: { x, y }, data: { text } });
export const DEFAULT_FLOW: { nodes: FlowNode[]; edges: FlowEdge[] } = {
  nodes: [
    n("start", "start", 0, "Greet the client warmly and introduce yourself as the AI booking assistant."),
    { id: "q1", type: "buttons", position: { x: 250, y: 120 }, data: { text: "Ask what type of event it is, then the date and start/end time.", buttons: ["Wedding", "Corporate", "Private party"] } },
    n("q2", "question", 240, "Ask the venue area in the UAE and number of guests."),
    n("cal", "calendar", 360, "Check the date against the artist's blocked dates."),
    n("busy", "handover", 500, "Say the artist is not available that date and suggest another date, or hand over.", 0),
    n("pkg", "package", 500, "Recommend the best-fitting package and quote its price.", 400),
    n("budget", "condition", 620, "Is the client happy with the price?", 400),
    n("neg", "negotiate", 760, "Offer a discount within the allowed limit.", 200),
    n("book", "booking", 760, "Confirm the details and send them to the artist for approval.", 600),
  ],
  edges: [
    { id: "e1", source: "start", target: "q1" }, { id: "e2", source: "q1", target: "q2" }, { id: "e3", source: "q2", target: "cal" },
    { id: "e4", source: "cal", target: "pkg", sourceHandle: "yes" }, { id: "e5", source: "cal", target: "busy", sourceHandle: "no" },
    { id: "e6", source: "pkg", target: "budget" },
    { id: "e7", source: "budget", target: "book", sourceHandle: "yes" }, { id: "e8", source: "budget", target: "neg", sourceHandle: "no" },
    { id: "e9", source: "neg", target: "book" },
  ],
};

export const isBranching = (k: FlowKind) => k === "condition" || k === "calendar";

/** Turns a flow into numbered conversation steps for the AI agent prompt. */
export function flowToPrompt(nodes: FlowNode[], edges: FlowEdge[]): string {
  if (!nodes.length) return "";
  const start = nodes.find((x) => x.type === "start") ?? nodes.find((x) => !edges.some((e) => e.target === x.id)) ?? nodes[0];
  const order: FlowNode[] = [];
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur.id)) continue;
    seen.add(cur.id); order.push(cur);
    for (const e of edges.filter((e) => e.source === cur.id)) { const t = nodes.find((x) => x.id === e.target); if (t) queue.push(t); }
  }
  const num = new Map(order.map((x, i) => [x.id, i + 1]));
  return order.map((x) => {
    const outs = edges.filter((e) => e.source === x.id && num.has(e.target));
    let next = "";
    if (x.type === "buttons" && x.data.buttons?.length) {
      const bs = x.data.buttons;
      const routes = bs.map((b, i) => { const e = outs.find((o) => o.sourceHandle === `b${i}`); return e ? `"${b}" go to step ${num.get(e.target)}` : null; }).filter(Boolean);
      const def = outs.find((o) => !o.sourceHandle?.startsWith("b"));
      next = [`end your reply with exactly [BUTTONS: ${bs.join(" | ")}]`, ...routes, def && `otherwise step ${num.get(def.target)}`].filter(Boolean).join("; ");
    } else if (isBranching(x.type)) {
      const y = outs.find((e) => e.sourceHandle === "yes"), no = outs.find((e) => e.sourceHandle === "no");
      next = [y && `if yes go to step ${num.get(y.target)}`, no && `if no go to step ${num.get(no.target)}`].filter(Boolean).join("; ");
    } else if (outs.length) next = `then step ${outs.map((e) => num.get(e.target)).join(" or ")}`;
    const extra = [
      x.data.urlButtons?.length && `share these links: ${x.data.urlButtons.map((u) => `${u.label}: ${u.url}`).join(", ")}`,
      x.data.saveAs && `remember the client's answer as {${x.data.saveAs}}`,
    ].filter(Boolean).join("; ");
    return `${num.get(x.id)}. [${kindLabel(x.type)}] ${x.data.text.trim()}${extra ? ` (${extra})` : ""}${next ? ` (${next})` : ""}`;
  }).join("\n");
}
