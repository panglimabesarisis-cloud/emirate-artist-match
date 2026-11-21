import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readStripeMode, runStripeCheckoutCheck } from './stripe-check.server';

const mocks = vi.hoisted(() => ({ balance: vi.fn(), create: vi.fn(), expire: vi.fn() }));
vi.mock('./stripe.server', () => ({ createStripeClient: () => ({ balance: { retrieve: mocks.balance }, checkout: { sessions: { create: mocks.create, expire: mocks.expire } } }), getStripeErrorMessage: () => 'Check failed' }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.balance.mockResolvedValue({ livemode: false });
  mocks.create.mockResolvedValue({ id: 'cs_test_check', livemode: false, status: 'open', url: 'https://checkout.stripe.com/c/pay/cs_test_check' });
  mocks.expire.mockResolvedValue({ status: 'expired' });
});

describe('safe Stripe checkout check', () => {
  it('blocks live credentials before any session is created', async () => {
    mocks.balance.mockResolvedValue({ livemode: true });
    expect(await readStripeMode()).toEqual({ mode: 'live' });
    await expect(runStripeCheckoutCheck()).rejects.toThrow('Live-mode credentials');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('blocks unknown credential mode before creating a session', async () => {
    mocks.balance.mockResolvedValue({});
    await expect(runStripeCheckoutCheck()).rejects.toThrow('could not be verified');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('blocks unreadable credentials before creating a session', async () => {
    mocks.balance.mockRejectedValue(new Error('Missing read permission'));
    await expect(runStripeCheckoutCheck()).rejects.toThrow('Missing read permission');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('confirms a test hosted checkout URL without returning it and expires checkout', async () => {
    expect(await runStripeCheckoutCheck()).toEqual({ mode: 'test', checkoutUrlReturned: true, sessionExpired: true });
    expect(mocks.balance).toHaveBeenCalledBefore(mocks.create);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ mode: 'payment', ui_mode: 'hosted_page', automatic_tax: {enabled:false} }));
    expect(mocks.expire).toHaveBeenCalledWith('cs_test_check');
  });
  it('rejects a missing hosted checkout URL and still expires the session', async () => {
    mocks.create.mockResolvedValue({ id: 'cs_test_check', livemode: false, status: 'open' });
    await expect(runStripeCheckoutCheck()).rejects.toThrow('did not return a hosted checkout URL');
    expect(mocks.expire).toHaveBeenCalledWith('cs_test_check');
  });
  it('rejects an unexpected live session and expires it without payment', async () => {
    mocks.create.mockResolvedValue({ id: 'cs_live_check', livemode: true, status: 'open', url: 'https://checkout.stripe.com/c/pay/cs_live_check' });
    await expect(runStripeCheckoutCheck()).rejects.toThrow('verified test-mode session');
    expect(mocks.expire).toHaveBeenCalledWith('cs_live_check');
  });
  it('reports incomplete expiry without leaking the hosted checkout URL', async () => {
    mocks.expire.mockRejectedValue(new Error('Provider unavailable'));
    expect(await runStripeCheckoutCheck()).toEqual({ mode: 'test', checkoutUrlReturned: true, sessionExpired: false });
  });
});