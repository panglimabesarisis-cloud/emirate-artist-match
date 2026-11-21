import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openOrder } from './payments.server';

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  insert: vi.fn(),
  rpc:vi.fn(),
  retrieve:vi.fn(),expire:vi.fn(),
}));

vi.mock('./stripe.server', () => ({
  createStripeClient: () => ({ checkout: { sessions: { create: mocks.createSession,retrieve:mocks.retrieve,expire:mocks.expire } } }),
  getStripeErrorMessage: (error:unknown) => error instanceof Error?error.message:'Check failed',
}));
vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: {
    rpc:mocks.rpc,
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
    mocks.rpc.mockImplementation(async(_name:string,args:{_order?:{processor_amount_minor:number}})=>({data:{id:'order-1',processor_amount_minor:args._order?.processor_amount_minor},error:null}));
    mocks.createSession.mockResolvedValue({ id: 'cs_test_session1', livemode: false, url: 'https://checkout.stripe.com/c/pay/cs_test_session1' });
  });

  it('uses IDR only in checkout price_data', async () => {
    await openOrder({ artist_id: 'artist-1', kind: 'deposit', amount_minor: 10500 }, 'Deposit', {}, 'https://dealmakertalent.com/join/payment');
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [expect.objectContaining({ price_data: expect.objectContaining({ currency: 'idr' }) })],
    }), { idempotencyKey: 'order-1' });
  });

  it('rejects invalid fils before creating an order or Stripe session', async () => {
    for (const amount_minor of [0, -1, 525000.5, NaN]) {
      await expect(openOrder({artist_id:'artist-1',kind:'booking',amount_minor},'Booking',{},'https://dealmakertalent.com')).rejects.toThrow('Invalid AED amount');
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it('lets Stripe select eligible payment methods rather than forcing card', async () => {
    await openOrder({ artist_id: 'artist-1', kind: 'deposit', amount_minor: 10500 }, 'Deposit', {}, 'https://dealmakertalent.com/join/payment');
    const params = mocks.createSession.mock.calls[0]?.[0];
    expect(params).toMatchObject({ mode: 'payment', ui_mode: 'hosted_page' });
    expect(params).not.toHaveProperty('payment_method_types');
  });

  it('uses real hosted return URLs and preserves payment references', async () => {
    await openOrder({ artist_id: 'artist-1', kind: 'deposit', amount_minor: 10500 }, 'Deposit', {}, 'https://dealmakertalent.com/join/payment');
    const params = mocks.createSession.mock.calls[0]?.[0];
    expect(params).toMatchObject({ ui_mode: 'hosted_page', cancel_url:'https://dealmakertalent.com/join/payment',metadata:{orderId:'order-1'} });
    expect(new URL(params.success_url).pathname).toBe('/checkout-return');
    expect(new URL(params.success_url).searchParams.get('orderId')).toBe('order-1');
    expect(params).not.toHaveProperty('payment_method_collection');
    expect(params).not.toHaveProperty('redirect_on_completion');
    expect(params).not.toHaveProperty('return_url');
  });

  it('converts AED fils at 4900 IDR per AED while preserving the stored AED amount', async () => {
    const order = { artist_id: 'artist-1', kind: 'deposit' as const, amount_minor: 10500 };
    await openOrder(order, 'Deposit', {}, 'https://dealmakertalent.com/join/payment');
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 51450000 }) })],
    }), { idempotencyKey: 'order-1' });
    expect(mocks.rpc).toHaveBeenCalledWith('begin_test_purchase',expect.objectContaining({_order:expect.objectContaining({artist_id:'artist-1',kind:'deposit',amount_minor:10500,processor_amount_minor:51450000,processor_currency:'idr'})}));
  });
  it('reuses a pending hosted order without creating or settling another payment',async()=>{
    mocks.rpc.mockResolvedValue({data:{id:'order-1',stripe_session_id:'cs_test_existing'},error:null});
    mocks.retrieve.mockResolvedValue({id:'cs_test_existing',livemode:false,status:'open',url:'https://checkout.stripe.com/c/pay/cs_test_existing'});
    expect(await openOrder({artist_id:'artist-1',kind:'deposit',amount_minor:10500},'Deposit',{},'https://dealmakertalent.com/join/payment')).toEqual({checkoutUrl:'https://checkout.stripe.com/c/pay/cs_test_existing',orderId:'order-1'});
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith('settle_test_purchase',expect.anything());
  });
  it('expires a pending embedded session and requires a retry without duplicate creation',async()=>{
    mocks.rpc.mockResolvedValue({data:{id:'order-1',stripe_session_id:'cs_test_existing'},error:null});
    mocks.retrieve.mockResolvedValue({id:'cs_test_existing',livemode:false,status:'open',url:null});
    await expect(openOrder({artist_id:'artist-1',kind:'deposit',amount_minor:10500},'Deposit',{},'https://dealmakertalent.com/join/payment')).rejects.toThrow('Previous checkout expired');
    expect(mocks.expire).toHaveBeenCalledWith('cs_test_existing');
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});