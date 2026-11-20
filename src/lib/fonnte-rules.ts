import { z } from 'zod';
import { internationalPhone } from './whatsapp-provider';

export const fonntePayload = z.object({
  secret: z.string().min(16).max(512),
  device: z.string().min(8).max(32),
  sender: z.string().min(8).max(32),
  message: z.string().max(5000).default(''),
  text: z.string().max(5000).default(''),
  member: z.string().max(100).default(''),
  inboxid: z.union([z.string().min(1).max(128), z.number().int().nonnegative()]).transform(String),
  timestamp: z.union([z.string(), z.number()]),
});

export function fonnteDecision(message: string) {
  const match = /^(YES|NO|1|2|SETUJU|TOLAK)(?:\s+([0-9a-f]{8}))?$/i.exec(message.trim());
  if (!match?.[1]) return null;
  return { decision: /^(YES|1|SETUJU)$/i.test(match[1]) ? 'yes' as const : 'no' as const, code: match[2]?.toLowerCase() ?? null };
}

export function fonnteTimestamp(value: string | number) {
  const numeric = Number(value);
  const at = Number.isFinite(numeric) ? (numeric < 1e12 ? numeric * 1000 : numeric) : Date.parse(String(value));
  if (!Number.isFinite(at)) throw new Error('Invalid timestamp');
  return new Date(at).toISOString();
}

export function selectFonnteBooking<T extends { id: string; created_at: string }>(rows: T[], code: string | null, timestamp: string) {
  const eligible = rows.filter(row => Date.parse(row.created_at) <= Date.parse(timestamp) && (!code || row.id.startsWith(code)));
  // A bare YES must never choose the newest booking among multiple pending offers.
  return eligible.length === 1 ? eligible[0] ?? null : null;
}

export function sameWhatsAppPhone(a: string, b: string) {
  try { return internationalPhone(a) === internationalPhone(b); } catch { return false; }
}