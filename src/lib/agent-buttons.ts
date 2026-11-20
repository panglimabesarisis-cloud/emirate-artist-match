import { extractButtons, type FlowNode, type FlowEdge } from "./ai-flow";

const normal = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Only saved nodes connected to the active flow may supply client choices. */
export function reachableButtons(nodes: FlowNode[], edges: FlowEdge[]) {
  const start = nodes.find(node => node.type === "start") ?? nodes.find(node => !edges.some(edge => edge.target === node.id)) ?? nodes[0];
  const queue = start ? [start.id] : [];
  const seen = new Set<string>();
  const buttons: FlowNode[] = [];
  while (queue.length) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const node = nodes.find(candidate => candidate.id === id);
    if (node?.type === "buttons" && node.data.buttons?.length) buttons.push(node);
    queue.push(...edges.filter(edge => edge.source === id).map(edge => edge.target));
  }
  return buttons;
}

/** Render selected saved choices; repair prose only when all choices uniquely identify a card. */
export function ensureAgentButtons(text: string, nodes: FlowNode[], requestedId?: string) {
  if (/\[(?:FORM|HANDOVER|BOOKING_READY)\b/.test(text)) return text;
  const parsed = extractButtons(text);
  let node = requestedId ? nodes.find(candidate => candidate.id === requestedId) : undefined;
  if (requestedId && !node) return parsed.buttons.length ? parsed.text : text;
  if (!node && parsed.buttons.length) {
    node = nodes.find(candidate => candidate.data.buttons?.length === parsed.buttons.length && candidate.data.buttons.every((label, index) => normal(label) === normal(parsed.buttons[index] ?? "")));
  }
  if (!node && !parsed.buttons.length) {
    const prose = ` ${normal(text)} `;
    const matches = nodes.filter(candidate => {
      const question = normal(candidate.data.text);
      const exactQuestion = candidate.data.text.trim().endsWith("?") && question.length >= 20 && prose.includes(` ${question} `);
      return exactQuestion || ((candidate.data.buttons?.length ?? 0) >= 2 && candidate.data.buttons?.every(label => prose.includes(` ${normal(label)} `)));
    });
    if (matches.length === 1) node = matches[0];
  }
  if (!node?.data.buttons?.length) return parsed.buttons.length ? parsed.text : text;
  const labels = node.data.buttons.slice(0, 6).map(label => label.replace(/[\[\]|]/g, " ").trim()).filter(Boolean);
  // A missing-marker repair replaces the merged prose with this card's question only.
  const intro = !requestedId && !parsed.buttons.length ? node.data.text.trim() : parsed.text;
  return `${intro}\n[BUTTONS: ${labels.join(" | ")}]`.trim();
}