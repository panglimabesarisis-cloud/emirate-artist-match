import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { submissionResult, verificationStoragePath, verificationSubmission } from './verification-rules';

export const requestVerificationOtp = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { phone: string }) => z.object({ phone: z.string().max(64) }).parse(data))
  .handler(async ({ data, context }) => {
    const owner = await context.supabase.rpc('private_artists').select('id').eq('user_id', context.userId).maybeSingle();
    if (owner.error || !owner.data) return { ok: false as const, error: 'forbidden' as const };
    const { requestOtpForArtist } = await import('./verification.server');
    return requestOtpForArtist(owner.data.id, data.phone);
  });
export const confirmVerificationOtp = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string }) => z.object({ code: z.string().max(128) }).parse(data))
  .handler(async ({ data, context }) => {
    const owner = await context.supabase.rpc('private_artists').select('id').eq('user_id', context.userId).maybeSingle();
    if (owner.error || !owner.data) return { ok: false as const, error: 'forbidden' as const };
    const { confirmOtpForArtist } = await import('./verification.server');
    return confirmOtpForArtist(owner.data.id, data.code);
  });
export const submitVerification = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof verificationSubmission>) => verificationSubmission.parse(data))
  .handler(async ({ data, context }) => {
    const response = await context.supabase.rpc('submit_verification', { _artist: data.artistId, _details: data.details, _files: data.files });
    if (response.error) throw new Error('Unable to submit verification');
    return submissionResult.parse(response.data);
  });
export const openVerificationFile = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { applicationId: string; fileId?: string }) => z.object({ applicationId: z.uuid(), fileId: z.uuid().optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (role.error || role.data !== true) throw new Error('forbidden');
    const app = await context.supabase.from('verification_applications').select('doc_path,decided_at,privacy_purged_at,artist_id').eq('id', data.applicationId).maybeSingle();
    if (app.error) throw new Error('Unable to open verification file');
    if (!app.data) throw new Error('file_not_found');
    if (app.data.privacy_purged_at || (app.data.decided_at && Date.parse(app.data.decided_at) <= Date.now() - 30 * 86400000)) throw new Error('documents_deleted');
    let path = app.data.doc_path;
    let fileId: string | null = null;
    if (data.fileId) {
      const file = await context.supabase.from('verification_files').select('id,storage_path').eq('application_id', data.applicationId).eq('id', data.fileId).maybeSingle();
      if (file.error) throw new Error('Unable to open verification file');
      if (!file.data) throw new Error('file_not_found');
      path = file.data.storage_path;
      fileId = file.data.id;
    }
    const owner = await context.supabase.rpc('private_artists').select('user_id').eq('id', app.data.artist_id).maybeSingle();
    const ownerId = owner.data?.user_id;
    if (!path || !ownerId || !verificationStoragePath(ownerId, path)) throw new Error('file_not_found');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const logged = await supabaseAdmin.from('verification_access_log').insert({ application_id: data.applicationId, file_id: fileId, admin_id: context.userId });
    if (logged.error) throw new Error('access_log_failed');
    const signed = await supabaseAdmin.storage.from('verification-docs').createSignedUrl(path, 120);
    if (signed.error || !signed.data) throw new Error('file_unavailable');
    return { url: signed.data.signedUrl, expires_in: 120 };
  });
export const decideVerification = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((data: { applicationId: string; status: 'approved' | 'rejected' | 'needs_more_info'; reasons: string[]; admin_note: string }) => z.object({ applicationId: z.uuid(), status: z.enum(['approved', 'rejected', 'needs_more_info']), reasons: z.array(z.string().trim().min(1).max(250)).max(10), admin_note: z.string().max(2000) }).parse(data))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (role.error || role.data !== true) throw new Error('forbidden');
    if (data.status !== 'approved' && !data.reasons.length) return { ok: false as const, error: 'reasons_required' as const };
    const updated = await context.supabase.from('verification_applications').update({ status: data.status, reasons: data.reasons, admin_note: data.admin_note || null }).eq('id', data.applicationId).select('id,status,decided_at').maybeSingle();
    if (updated.error) throw new Error(updated.error.message === 'documents_deleted' ? 'documents_deleted' : 'decision_failed');
    if (!updated.data) return { ok: false as const, error: 'application_not_found' as const };
    return { ok: true as const, ...updated.data };
  });
