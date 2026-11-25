/** Illustrative content and rules for the home page demos. No real people, bookings or payments. */

export type InvoiceLine = { label: string; amount: number };
export function demoTotals(lines: InvoiceLine[]) {
  const cents = lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0);
  const vat = Math.round(cents * 0.05);
  return { subtotal: cents / 100, vat: vat / 100, total: (cents + vat) / 100 };
}
export const money = (value: number) => `AED ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type FlowKind = "start" | "question" | "date" | "artist" | "ratecard" | "quote" | "calendar" | "buttons" | "invoice" | "negotiation" | "clients" | "talents" | "done";
/** `branches` are separate outputs of a box; with `switches` each one is shown as an on/off switch. */
export type FlowBox = { id: string; kind: FlowKind; title: string; text: string; branches?: string[]; switches?: boolean };
export const FLOW_KINDS: Record<FlowKind, { title: string; text: string; branches?: string[] }> = {
  start: { title: "New message", text: "A client wants to book" },
  question: { title: "Question", text: "Form: name, email, WhatsApp" },
  date: { title: "Date", text: "Event, date, time and location" },
  artist: { title: "Send to artist", text: "Share the enquiry and invoice link" },
  ratecard: { title: "Rate card", text: "Price and extra requirements" },
  quote: { title: "Quote", text: "Send the price to the client" },
  calendar: { title: "Google Calendar", text: "Check the artist is available" },
  buttons: { title: "Question type", text: "Buttons", branches: ["Book", "Cancel", "Later"] },
  invoice: { title: "Invoice", text: "Pay with Stripe" },
  negotiation: { title: "Negotiation", text: "Agree on a new price" },
  clients: { title: "Client list", text: "Save the client for follow-up" },
  talents: { title: "List Talent", text: "Offer other performers" },
  done: { title: "Job done", text: "Booking completed" },
};
export const FLOW_PALETTE = Object.keys(FLOW_KINDS) as FlowKind[];
/** `inputs` are the cables that reach a box: the box they leave and which of its outputs. */
export type FlowStep = FlowBox & { inputs: [from: string, branch: number][] };
const step = (id: string, kind: FlowKind, inputs: (string | [string, number])[] = [], extra: Partial<FlowBox> = {}): FlowStep => ({
  id, kind, ...FLOW_KINDS[kind], inputs: inputs.map((input) => (typeof input === "string" ? [input, 0] : input)), ...extra,
});
/** The booking from the chat above, in the order the pointer builds it. */
export const FLOW_STEPS: FlowStep[] = [
  step("start", "start"),
  step("question", "question", ["start"]),
  step("date", "date", ["question"]),
  step("artist", "artist", ["date"]),
  step("ratecard", "ratecard", ["artist"]),
  step("quote", "quote", ["ratecard"]),
  step("calendar", "calendar", ["quote"]),
  step("buttons", "buttons", ["calendar"]),
  // Book
  step("invoice", "invoice", [["buttons", 0]]),
  step("notify", "artist", ["invoice"], { text: "Tell the artist it is paid" }),
  step("schedule", "calendar", ["notify"], { text: "Add the job to the calendar" }),
  step("done", "done", ["schedule"]),
  // Cancel, with a switch for each reason
  step("why", "question", [["buttons", 1]], { text: "Why did you cancel?", branches: ["Another reason", "Find other talent"], switches: true }),
  step("negotiation", "negotiation", [["why", 0]]),
  step("clients", "clients", [["buttons", 2], ["why", 0]]),
  step("talents", "talents", [["why", 0], ["why", 1]]),
];
export const starterFlow = (): FlowBox[] => FLOW_STEPS.map(({ inputs: _inputs, ...box }) => box);

export type Cable = { from: string; to: string; port: number };
export const starterCables = (): Cable[] => FLOW_STEPS.flatMap((box) => box.inputs.map(([from, port]) => ({ from, to: box.id, port })));
/** Adds a cable. Boxes cannot connect to themselves, and "New message" is always the first box. */
export function connect(cables: Cable[], from: string, to: string, port = 0): Cable[] {
  if (from === to || to === "start" || cables.some((c) => c.from === from && c.to === to && c.port === port)) return cables;
  return [...cables, { from, to, port }];
}

export type Point = { x: number; y: number };
/** A cable from an output on the right of one box to an input on the left of another. */
export function cablePath(a: Point, b: Point, offset = 22) {
  if (b.x >= a.x + offset * 2 && b.y - a.y > 150) {
    // Far below: down the gap beside the box first, then across, so the cable does not cross the boxes between.
    const turn = a.x + offset; const r = Math.min(14, offset);
    return `M${a.x} ${a.y} H${turn - r} Q${turn} ${a.y} ${turn} ${a.y + r} V${b.y - r} Q${turn} ${b.y} ${turn + r} ${b.y} H${b.x}`;
  }
  if (b.x >= a.x + 12) {
    const bend = Math.max(offset, (b.x - a.x) / 2);
    return `M${a.x} ${a.y} C${a.x + bend} ${a.y} ${b.x - bend} ${b.y} ${b.x} ${b.y}`;
  }
  // Backwards: out to the right, back between the two rows, and in from the left.
  const mid = Math.abs(b.y - a.y) > 60 ? (a.y + b.y) / 2 : Math.max(a.y, b.y) + 70;
  const right = a.x + offset; const left = b.x - offset;
  const first = mid >= a.y ? 1 : -1; const last = b.y >= mid ? 1 : -1;
  const r = Math.max(0, Math.min(offset, 14, Math.abs(mid - a.y) / 2, Math.abs(b.y - mid) / 2));
  return `M${a.x} ${a.y} H${right - r} Q${right} ${a.y} ${right} ${a.y + first * r} V${mid - first * r} Q${right} ${mid} ${right - r} ${mid} H${left + r} Q${left} ${mid} ${left} ${mid + last * r} V${b.y - last * r} Q${left} ${b.y} ${left + r} ${b.y} H${b.x}`;
}

export const PAY_LINES: InvoiceLine[] = [
  { label: "DJ set · 3 hours", amount: 2500 },
  { label: "Sound system and microphones", amount: 600 },
  { label: "Travel to Abu Dhabi", amount: 250 },
];
/** What the invoice shows after `typed` characters of the job list have been written. */
export function typedLines(lines: InvoiceLine[], typed: number) {
  const out: { label: string; amount: number | null; done: boolean }[] = [];
  let left = typed;
  for (const line of lines) {
    if (left <= 0) break;
    const price = String(line.amount);
    const label = line.label.slice(0, left);
    const digits = price.slice(0, Math.max(0, left - line.label.length));
    out.push({ label, amount: digits ? Number(digits) : null, done: left >= line.label.length + price.length });
    left -= line.label.length + price.length;
  }
  return out;
}
export const typedLength = (lines: InvoiceLine[]) => lines.reduce((sum, line) => sum + line.label.length + String(line.amount).length, 0);
