import { describe, expect, it } from 'vitest';
import { requiresPriceConsentBeforeReview, selectedWhatsAppStep } from './agent-approval';
import type { FlowEdge, FlowNode } from './ai-flow';

const nodes: FlowNode[] = [
  { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { text: 'Hello' } },
  { id: 'choices', type: 'buttons', position: { x: 0, y: 0 }, data: { text: 'Proceed?', buttons: ['Book Now', 'Book Later'] } },
  { id: 'wa', type: 'whatsapp', position: { x: 0, y: 0 }, data: { text: 'Artist approval' } },
];
const edges: FlowEdge[] = [{ id: 'a', source: 'start', target: 'choices' }, { id: 'b', source: 'choices', sourceHandle: 'b0', target: 'wa' }];
const history = (answer: string) => [{ sender: 'ai', body: 'Proceed?\n[BUTTONS: Book Now | Book Later]' }, { sender: 'client', body: answer }];

describe('Book Now artist review', () => {
  it('advances Book Now directly to the connected WhatsApp card', () => {
    expect(selectedWhatsAppStep(nodes, edges, history('Book Now'))?.id).toBe('wa');
  });
  it('does not send approval for Book Later', () => {
    expect(selectedWhatsAppStep(nodes, edges, history('Book Later'))).toBeNull();
  });
  it('does not activate disconnected or undisplayed choices', () => {
    expect(selectedWhatsAppStep(nodes, [], history('Book Now'))).toBeNull();
    expect(selectedWhatsAppStep(nodes, edges, [{ sender: 'client', body: 'Book Now' }])).toBeNull();
  });
  it('does not treat client YES as artist approval or a Book Now selection', () => {
    expect(selectedWhatsAppStep(nodes, edges, history('YES'))).toBeNull();
  });
  it('uses review policy without changing the default price-consent policy', () => {
    expect(requiresPriceConsentBeforeReview(true, false)).toBe(false);
    expect(requiresPriceConsentBeforeReview(false, false)).toBe(true);
  });
  it('preserves artist-entered invoice review before client price consent', () => {
    expect(requiresPriceConsentBeforeReview(false, true)).toBe(false);
  });
});