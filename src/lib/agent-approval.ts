import { extractButtons, type FlowEdge, type FlowNode } from './ai-flow';
import { reachableButtons } from './agent-buttons';

const normalize = (value: string) => value.trim().toLocaleLowerCase();

/** Match a selected, actually displayed choice to its saved WhatsApp destination. */
export function selectedWhatsAppStep(nodes: FlowNode[], edges: FlowEdge[], history: { sender: string; body: string }[]) {
  const last = history.at(-1);
  if (last?.sender !== 'client') return null;
  const previous = history.slice(0, -1).reverse().find(message => message.sender === 'ai');
  if (!previous) return null;
  const displayed = extractButtons(previous.body).buttons;
  if (!displayed.length) return null;
  const matches = reachableButtons(nodes, edges).filter(node => node.data.buttons?.length === displayed.length && node.data.buttons.every((label, index) => normalize(label) === normalize(displayed[index] ?? '')));
  if (matches.length !== 1) return null;
  const source = matches[0];
  if (!source) return null;
  const index = source.data.buttons?.findIndex(label => normalize(label) === normalize(last.body)) ?? -1;
  if (index < 0) return null;
  const edge = edges.find(candidate => candidate.source === source.id && candidate.sourceHandle === `b${index}`)
    ?? edges.find(candidate => candidate.source === source.id && !candidate.sourceHandle);
  return nodes.find(node => node.id === edge?.target && node.type === 'whatsapp') ?? null;
}

/** Requesting artist review is not consenting to an estimate or authorizing payment. */
export function requiresPriceConsentBeforeReview(whatsapp: boolean, artistInvoice: boolean) {
  return !whatsapp && !artistInvoice;
}

export function approvalPriceRule(whatsapp: boolean, artistInvoice: boolean, startingOnly: boolean, minimum: number | null, maxDiscount: number, floor: number) {
  if (artistInvoice) return '- Invoice prices must be supplied and approved by the artist. Use amount 1 as an internal non-payable placeholder in BOOKING_READY; never show it as a quote.';
  if (!requiresPriceConsentBeforeReview(whatsapp, artistInvoice)) return '- At the saved Send to WhatsApp step, request artist review immediately using the collected event details. Do not insert a starting-rate confirmation or additional price question. A Book Now selection on that branch consents only to artist review, NOT to any price or payment. Use the stored starting/package estimate internally for the pending draft, never describe it as an agreed final price. Final pricing and client contract acceptance remain required before payment.';
  if (startingOnly) return '- Before sending approval, explain the starting-rate estimate and ask the client to agree to it. Never turn a request to book into consent to an undisclosed price. Do not discount this estimate.';
  if (minimum === null) return '- No payable draft can be created until the artist supplies a price; hand over.';
  return `- You may offer at most ${maxDiscount}% off. Never go below AED ${Math.round(floor).toLocaleString('en-US')}. If the client wants lower, politely decline and say the artist can review.`;
}