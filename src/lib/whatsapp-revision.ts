import { z } from 'zod';

export const revisionSchema = z.object({
  amount: z.number().positive().max(10_000_000).nullable(),
  note: z.string().max(1000).nullable(),
}).strict();

export function revisionIntent(message: string) {
  return /\b(harga|price|revisi|revise|revision|ubah|change|update|catatan|notes?|tambah|add)\b/i.test(message);
}

export function revisionReference(message: string) {
  return /\b(?:ref(?:erence)?(?: order)?|order)\s*:?\s*([0-9a-f]{8})\b/i.exec(message)?.[1]?.toLowerCase() ?? null;
}

/** AI cannot invent a price, interpret a guest count as money, or add unsupported notes. */
export function validateRevision(message: string, output: unknown) {
  const proposal = revisionSchema.parse(output);
  if (proposal.amount !== null) {
    const amounts = [...message.matchAll(/\bAED\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\b/gi)]
      .map(match => Number(match[1]?.replaceAll(',', '')));
    if (amounts.length !== 1 || amounts[0] !== proposal.amount || !/\b(harga|price|revisi|revise|ubah|change|update)\b/i.test(message)) {
      throw new Error('Specify one replacement price in AED, excluding VAT');
    }
    if (/\b(incl(?:uding)?|termasuk|total|diskon|discount|tambahan|additional)\b/i.test(message)) {
      throw new Error('Specify a replacement subtotal, not a total or extra charge');
    }
  }
  const note = proposal.note?.trim() || null;
  if (note && !message.toLowerCase().includes(note.toLowerCase())) throw new Error('Note must be quoted from the artist message');
  return { amount: proposal.amount, note };
}