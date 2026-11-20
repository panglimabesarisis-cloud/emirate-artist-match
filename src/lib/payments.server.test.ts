import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openOrder } from './payments.server';

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('./stripe.server', () => ({
  createStripeClient: () => ({ checkout: { sessions: { create: mocks.createSession } } }),
}));
vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: mocks.insert,
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
}));

describe('checkout-only IDR pricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'order-1' }, error: null }) }) });
    mocks.createSession.mockResolvedValue({ id: 'session-1', client_secret: 'test-client-secret' });
  });

  it('uses IDR only in checkout price_data', async () => {
    await openOrder({ artist_id: 'artist-1', kind: 'deposit', amount_minor: 10500 }, 'Deposit', {}, 'https://dealmakertalent.com/join/payment');
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [expect.objectContaining({ price_data: expect.objectContaining({ currency: 'idr' }) })],
    }), { idempotencyKey: 'order-1' });
  });

  it('omits return_url when embedded checkout never redirects', async () => {
    await openOrder({ artist_id: 'artist-1', kind: 'deposit', amount_minor: 10500 }, 'Deposit', {}, 'https://dealmakertalent.com/join/payment');
    const params = mocks.createSession.mock.calls[0]?.[0];
    expect(params).toMatchObject({ ui_mode: 'embedded_page', redirect_on_completion: 'never' });
    expect(params).not.toHaveProperty('return_url');
  });

  it('removes the existing hundred-fold scaling only from the checkout amount', async () => {
    const order = { artist_id: 'artist-1', kind: 'deposit' as const, amount_minor: 10500 };
    await openOrder(order, 'Deposit', {}, 'https://dealmakertalent.com/join/payment');
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 105 }) })],
    }), { idempotencyKey: 'order-1' });
    expect(mocks.insert).toHaveBeenCalledWith({ artist_id: 'artist-1', kind: 'deposit', amount_minor: 10500 });
  });
});