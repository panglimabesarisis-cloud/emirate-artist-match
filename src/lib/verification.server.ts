import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { readWhatsAppConfig } from './whatsapp-provider.server';
import { normalizeVerificationPhone, otpResult } from './verification-rules';
import { z } from 'zod';

export async function verificationCodeHash(artist: string, id: string, code: string) {
  const secret = process.env['VERIFICATION_OTP_HASH_SECRET'];
  if (!secret) throw new Error('Verification codes are not configured');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${artist}:${id}:${code}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Rejection sampling avoids modulo bias; no OTP/plaintext goes into a record or response.
export function newVerificationCode() {
  const a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while ((a[0] ?? 0) >= 4294000000);
  return String((a[0] ?? 0) % 1000000).padStart(6, '0');
}

export async function requestOtpForArtist(artist: string, rawPhone: string) {
  const phone = normalizeVerificationPhone(rawPhone);
  if (!phone) return { ok: false as const, error: 'invalid_phone' as const };
  const config = await readWhatsAppConfig();
  if (!config.token || !process.env['VERIFICATION_OTP_HASH_SECRET']) return { ok: false as const, error: 'not_configured' as const };
  const id = crypto.randomUUID(), code = newVerificationCode();
  const hash = await verificationCodeHash(artist, id, code);
  const reserved = await supabaseAdmin.rpc('reserve_verification_otp', { _artist: artist, _id: id, _phone: phone, _hash: hash });
  if (reserved.error) throw new Error('Unable to reserve verification code');
  const result = otpResult.parse(reserved.data);
  if (!result.ok) return result;
  let accepted = false, messageId: string | null = null;
  try {
    const body = new FormData();
    body.set('target', phone.slice(1)); body.set('countryCode', '0'); body.set('connectOnly', 'true');
    body.set('message', `Dealmaker verification code: ${code}\nValid for 5 minutes. Do not share this code.`);
    const response = await fetch('https://api.fonnte.com/send', { method: 'POST', headers: { Authorization: config.token }, body, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      const sent = await response.json() as { status?: boolean; id?: unknown[] };
      const first = sent.id?.[0];
      accepted = sent.status === true && (typeof first === 'string' || typeof first === 'number');
      if (accepted) messageId = `fonnte:${String(first)}`;
    }
  } catch { /* Never log provider bodies or OTP messages. Acceptance is not delivery. */ }
  const saved = await supabaseAdmin.from('verification_otps').update({ send_status: accepted ? 'accepted' : 'failed', provider_message_id: messageId }).eq('id', id);
  if (saved.error) throw new Error('Unable to save verification send status');
  return accepted ? result : { ok: false as const, error: 'send_failed' as const };
}

export async function confirmOtpForArtist(artist: string, code: string) {
  const latest = await supabaseAdmin.from('verification_otps').select('id').eq('artist_id', artist).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw new Error('Unable to check verification code');
  if (!latest.data) return { ok: false as const, error: 'expired' as const };
  if (!process.env['VERIFICATION_OTP_HASH_SECRET']) return { ok: false as const, error: 'not_configured' as const };
  const hash = await verificationCodeHash(artist, latest.data.id, code);
  const checked = await supabaseAdmin.rpc('check_verification_otp', { _artist: artist, _id: latest.data.id, _hash: hash });
  if (checked.error) throw new Error('Unable to check verification code');
  return otpResult.parse(checked.data);
}

export async function runVerificationRetention() {
  const due = new Date(Date.now() - 30 * 86400000).toISOString();
  const candidates = await supabaseAdmin.from('verification_applications').select('id,doc_path,verification_files(storage_path)').in('status', ['approved', 'rejected', 'needs_more_info']).lte('decided_at', due).is('privacy_purged_at', null).order('decided_at').limit(100);
  if (candidates.error) throw new Error('Unable to load verification retention work');
  const apps = candidates.data ?? [];
  if (!apps.length) return { purged: 0, failed: 0, remaining: 0, has_more: false };
  const paths = [...new Set(apps.flatMap((app) => [...app.verification_files.map((f) => f.storage_path), ...(app.doc_path ? [app.doc_path] : [])]))];
  // One batched Storage call and one transactional finalizer avoid sequential per-file requests.
  if (paths.length) {
    const removed = await supabaseAdmin.storage.from('verification-docs').remove(paths);
    if (removed.error) return { purged: 0, failed: apps.length, remaining: apps.length, has_more: apps.length === 100 };
  }
  const finalized = await supabaseAdmin.rpc('finalize_verification_retention_batch', { _applications: apps.map((app) => app.id) });
  if (finalized.error) throw new Error('Unable to finalize verification retention');
  const result = z.object({ purged: z.number().int(), failed: z.number().int() }).parse(finalized.data);
  return { ...result, remaining: apps.length - result.purged, has_more: apps.length === 100 };
}
