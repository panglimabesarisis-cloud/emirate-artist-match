import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStripeClient, getStripeErrorMessage } from './stripe.server';

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