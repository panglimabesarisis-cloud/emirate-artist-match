import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), saved: vi.fn(), config: vi.fn(), fetch: vi.fn(), latest: vi.fn(), candidates: vi.fn(), files: vi.fn(), remove: vi.fn() }));
vi.mock('./whatsapp-provider.server', () => ({ readWhatsAppConfig: mocks.config }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  rpc: mocks.rpc,
  storage: { from: () => ({ remove: mocks.remove }) },
  from: (table: string) => {
    let writing = false;
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder, in: () => builder, lte: () => builder, is: () => builder,
      update: (value: unknown) => { writing = true; mocks.saved(value); return builder; },
      limit: () => table === 'verification_applications' ? mocks.candidates() : builder,
      maybeSingle: mocks.latest,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(writing ? { error: null } : mocks.files()).then(resolve),
    };
    return builder;
  },
} }));
import { confirmOtpForArtist, newVerificationCode, requestOtpForArtist, runVerificationRetention, verificationCodeHash } from './verification.server';
import { normalizeVerificationPhone, verificationStoragePath } from './verification-rules';

describe('private verification server', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('fetch', mocks.fetch);
    vi.stubEnv('VERIFICATION_OTP_HASH_SECRET', 'isolated-test-only-not-a-real-secret');
    mocks.config.mockResolvedValue({ token: 'fixture-token', provider: 'fonnte' });
    mocks.rpc.mockResolvedValue({ data: { ok: true, expires_in: 300, resend_after: 30 }, error: null });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('generates exactly six digits including leading zeroes', () => {
    for (let i = 0; i < 100; i++) expect(newVerificationCode()).toMatch(/^\d{6}$/);
  });
  it('binds keyed hashes to code, artist and OTP id', async () => {
    const hash = await verificationCodeHash('artist-a', 'id-a', '012345');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('012345');
    expect(await verificationCodeHash('artist-b', 'id-a', '012345')).not.toBe(hash);
    expect(await verificationCodeHash('artist-a', 'id-b', '012345')).not.toBe(hash);
    expect(await verificationCodeHash('artist-a', 'id-a', '012346')).not.toBe(hash);
  });
  it('sends only after reservation and persists no plaintext code', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ status: true, id: [123] })));
    const result = await requestOtpForArtist('artist-a', '+971501234567');
    expect(result).toEqual({ ok: true, expires_in: 300, resend_after: 30 });
    const request = mocks.fetch.mock.calls[0]?.[1] as { body: FormData } | undefined;
    const message = String(request?.body.get('message'));
    const code = message.match(/code: (\d{6})/)?.[1];
    expect(code).toMatch(/^\d{6}$/);
    expect(request?.body.get('target')).toBe('971501234567');
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0] ?? 0);
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(`"${code}"`);
    expect(mocks.saved).toHaveBeenCalledWith({ send_status: 'accepted', provider_message_id: 'fonnte:123' });
  });
  it('does not send when the database rate limit rejects a request', async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: false, error: 'rate_limited', retry_after: 30 }, error: null });
    expect(await requestOtpForArtist('artist-a', '+971501234567')).toEqual({ ok: false, error: 'rate_limited', retry_after: 30 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('stores provider rejection without returning its private body', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ status: false, reason: 'fixture-token' })));
    expect(await requestOtpForArtist('artist-a', '+971501234567')).toEqual({ ok: false, error: 'send_failed' });
    expect(mocks.saved).toHaveBeenCalledWith({ send_status: 'failed', provider_message_id: null });
  });
  it('rejects missing configuration without reserving or sending', async () => {
    vi.stubEnv('VERIFICATION_OTP_HASH_SECRET', '');
    expect(await requestOtpForArtist('artist-a', '+971501234567')).toEqual({ ok: false, error: 'not_configured' });
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('returns wrong_code with tries_left from atomic SQL validation', async () => {
    mocks.latest.mockResolvedValue({ data: { id: 'id-a' }, error: null });
    mocks.rpc.mockResolvedValue({ data: { ok: false, error: 'wrong_code', tries_left: 4 }, error: null });
    expect(await confirmOtpForArtist('artist-a', '123456')).toEqual({ ok: false, error: 'wrong_code', tries_left: 4 });
    expect(mocks.rpc.mock.calls[0]?.[1]._hash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('does not finalize privacy deletion after Storage failure', async () => {
    mocks.candidates.mockResolvedValue({ data: [{ id: 'app-a', doc_path: null, verification_files: [{ storage_path: 'owner/photo.jpg' }] }], error: null });
    mocks.remove.mockResolvedValue({ error: { message: 'Denied' } });
    expect(await runVerificationRetention()).toEqual({ purged: 0, failed: 1, remaining: 1, has_more: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('removes Storage bytes before finalizing metadata', async () => {
    mocks.candidates.mockResolvedValue({ data: [{ id: 'app-a', doc_path: 'owner/photo.jpg', verification_files: [{ storage_path: 'owner/photo.jpg' }] }], error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ data: { purged: 1, failed: 0 }, error: null });
    expect(await runVerificationRetention()).toEqual({ purged: 1, failed: 0, remaining: 0, has_more: false });
    expect(mocks.remove).toHaveBeenCalledWith(['owner/photo.jpg']);
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0] ?? 0);
    expect(mocks.rpc).toHaveBeenCalledWith('finalize_verification_retention_batch', { _applications: ['app-a'] });
  });
  it('accepts full international phone only, without guessing country', () => {
    expect(normalizeVerificationPhone('+971 50 123 4567')).toBe('+971501234567');
    expect(normalizeVerificationPhone('0501234567')).toBeNull();
  });
  it('signs only owner-folder paths, including legacy documents', () => {
    expect(verificationStoragePath('owner', 'owner/front.jpg')).toBe(true);
    expect(verificationStoragePath('owner', 'other/front.jpg')).toBe(false);
    expect(verificationStoragePath('owner', 'owner/../other/front.jpg')).toBe(false);
    expect(verificationStoragePath('owner', 'owner/')).toBe(false);
    expect(verificationStoragePath('owner', 'owner\\other.jpg')).toBe(false);
  });
});
