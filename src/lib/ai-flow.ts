/** Visual AI flow: shared types, default master template, and conversion to agent instructions. */
export type FlowKind = "start" | "question" | "calendar" | "package" | "condition" | "negotiate" | "handover" | "booking";
export type FlowNode = { id: string; type: FlowKind; position: { x: number; y: number }; data: { text: string } };
export type FlowEdge = { id: string; source: string; target: string; sourceHandle?: string | null };

export const FLOW_KINDS: { kind: FlowKind; label: string; hint: string; placeholder: string }[] = [
  { kind: "start", label: "Greeting", hint: "Opening message", placeholder: "Welcome the client warmly and introduce yourself as the AI assistant." },
  { kind: "question", label: "Ask question", hint: "Collect a detail", placeholder: "Ask for the event date and start/end time." },
  { kind: "calendar", label: "Check calendar", hint: "Validate availability", placeholder: "Check the requested date against blocked dates." },
  { kind: "package", label: "Offer package", hint: "Recommend from rate card", placeholder: "Recommend the best-fitting package with its price." },
  { kind: "condition", label: "Condition", hint: "Yes / No branch", placeholder: "Is the client's budget at least the cheapest package?" },
  { kind: "negotiate", label: "Negotiate", hint: "Discount rules", placeholder: "Offer a small discount within the allowed limit if the client hesitates." },
  { kind: "handover", label: "Hand over", hint: "Pass to the artist", placeholder: "Hand the conversation to the artist." },
  { kind: "booking", label: "Booking ready", hint: "Send for approval", placeholder: "Summarise the agreed details and send them for artist approval." },
];
export const kindLabel = (k: FlowKind) => FLOW_KINDS.find((f) => f.kind === k)?.label ?? k;

const n = (id: string, type: FlowKind, y: number, text: string, x = 250): FlowNode => ({ id, type, position: { x, y }, data: { text } });
export const DEFAULT_FLOW: { nodes: FlowNode[]; edges: FlowEdge[] } = {
  nodes: [
    n("start", "start", 0, "Greet the client warmly and introduce yourself as the AI booking assistant."),
    n("q1", "question", 120, "Ask the event type, date, and start/end time."),
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
    if (isBranching(x.type)) {
      const y = outs.find((e) => e.sourceHandle === "yes"), no = outs.find((e) => e.sourceHandle === "no");
      next = [y && `if yes go to step ${num.get(y.target)}`, no && `if no go to step ${num.get(no.target)}`].filter(Boolean).join("; ");
    } else if (outs.length) next = `then step ${outs.map((e) => num.get(e.target)).join(" or ")}`;
    return `${num.get(x.id)}. [${kindLabel(x.type)}] ${x.data.text.trim()}${next ? ` (${next})` : ""}`;
  }).join("\n");
}
