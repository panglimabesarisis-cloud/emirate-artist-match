import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStripeClient, getStripeErrorMessage, verifyWebhook } from './stripe.server';

beforeEach(() => { vi.stubEnv('STRIPE_SECRET_KEY', ''); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Stripe gateway responses', () => {
  function setup(payload: unknown) {
    vi.stubEnv('STRIPE_SANDBOX_API_KEY', 'test-connection');
    vi.stubEnv('LOVABLE_API_KEY', 'test-gateway');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    return createStripeClient('sandbox');
  }

  it('rejects the observed HTTP-200 credential failure instead of returning a fake Stripe session', async () => {
    const stripe = setup({ status: 401, title: 'Credential not found', message: 'Credential not found' });
    await expect(stripe.checkout.sessions.retrieve('cs_test_example')).rejects.toThrow('Reconnect Stripe');
  });

  it('preserves valid Stripe session responses', async () => {
    const stripe = setup({ id: 'cs_test_example', object: 'checkout.session', status: 'open', client_secret: 'test-only-secret' });
    const session = await stripe.checkout.sessions.retrieve('cs_test_example');
    expect(session.id).toBe('cs_test_example');
    expect(session.client_secret).toBe('test-only-secret');
  });

  it('does not expose gateway problem details in the displayed error', async () => {
    const stripe = setup({ status: 400, title: 'Gateway failure', message: 'private gateway detail' });
    const error = await stripe.checkout.sessions.retrieve('cs_test_example').catch((error: unknown) => error);
    expect(getStripeErrorMessage(error)).toContain('Stripe payment gateway is unavailable');
    expect(getStripeErrorMessage(error)).not.toContain('private gateway detail');
  });
});

describe('self-managed Stripe credentials', () => {
  it('uses a restricted test key directly without connector credentials', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_test_fixture');
    vi.stubEnv('STRIPE_SANDBOX_API_KEY', '');
    vi.stubEnv('LOVABLE_API_KEY', '');
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ object: 'balance', livemode: false }), {
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const balance = await createStripeClient('sandbox').balance.retrieve();
    expect(balance.livemode).toBe(false);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(input)).toBe('https://api.stripe.com/v1/balance');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer rk_test_fixture');
    expect(headers.has('X-Connection-Api-Key')).toBe(false);
  });

  it('prefers the self-managed test key over an obsolete gateway key', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
    vi.stubEnv('STRIPE_SANDBOX_API_KEY', 'obsolete-connection');
    vi.stubEnv('LOVABLE_API_KEY', '');
    expect(() => createStripeClient('sandbox')).not.toThrow();
  });

  it('blocks live credentials from sandbox checkout', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_live_fixture');
    expect(() => createStripeClient('sandbox')).toThrow('checkout blocked');
  });

  it('blocks test credentials from live checkout', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
    expect(() => createStripeClient('live')).toThrow('checkout blocked');
  });

  it('verifies self-managed webhooks using the configured signing secret', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'rk_test_fixture');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_fixture');
    vi.stubEnv('PAYMENTS_SANDBOX_WEBHOOK_SECRET', '');
    const body = JSON.stringify({ id: 'evt_fixture', type: 'checkout.session.completed', data: { object: { id: 'cs_test_fixture' } } });
    const timestamp = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_fixture'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
    const hex = Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('');
    const request = new Request('https://example.test/webhook', { method: 'POST', body, headers: { 'stripe-signature': `t=${timestamp},v1=${hex}` } });
    expect((await verifyWebhook(request, 'sandbox')).id).toBe('evt_fixture');
    await expect(verifyWebhook(new Request('https://example.test/webhook', { method: 'POST', body, headers: { 'stripe-signature': `t=${timestamp},v1=invalid` } }), 'sandbox')).rejects.toThrow('Invalid webhook signature');
  });
});