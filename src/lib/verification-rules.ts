import { z } from 'zod';

export const VERIFICATION_REASONS = [
  'The photo is blurry or has glare on the document',
  'The face in the selfie does not clearly match the document',
  'The document looks cropped or hard to read',
  'The selfie check could not confirm a live person',
] as const;
export const verificationError = z.enum(['expired', 'wrong_code', 'too_many', 'rate_limited', 'invalid_phone', 'send_failed', 'not_configured', 'forbidden', 'application_exists', 'staff_review_required', 'phone_not_confirmed', 'invalid_details', 'invalid_files']);
export const otpResult = z.union([
  z.object({ ok: z.literal(true), expires_in: z.number().optional(), resend_after: z.number().optional(), phone: z.string().optional(), phone_confirmed_at: z.string().optional() }),
  z.object({ ok: z.literal(false), error: verificationError, tries_left: z.number().optional(), retry_after: z.number().optional() }),
]);
export const verificationSubmission = z.object({
  artistId: z.uuid(),
  details: z.object({ residency: z.enum(['uae', 'foreign']), full_name: z.string().min(4).max(160), doc_number: z.string().min(6).max(30), doc_expiry: z.iso.date(), dob: z.iso.date().optional(), nationality: z.string().max(100).optional(), address: z.record(z.string(), z.string().max(500)).optional(), phone: z.string().max(16) }),
  files: z.array(z.object({ kind: z.enum(['id_front', 'id_back', 'passport', 'national_id', 'selfie_center', 'selfie_left', 'selfie_right']), storage_path: z.string().max(500) })).min(4).max(7),
});
export const submissionResult = z.union([
  z.object({ ok: z.literal(true), application_id: z.uuid(), status: z.literal('submitted') }),
  z.object({ ok: z.literal(false), error: verificationError }),
]);
export function normalizeVerificationPhone(phone: string): string | null {
  const cleaned = phone.trim().replace(/[\s()-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null;
}
export function verificationStoragePath(ownerId: string, path: string) {
  return path.startsWith(`${ownerId}/`) && path.length > ownerId.length + 1 && !path.split('/').includes('..') && !path.includes('\\');
}
