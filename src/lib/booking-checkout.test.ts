import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoiceNo: null as string | null, total: 5250, paid: 0, depositPct: 100,
  writes: [] as Record<string, unknown>[], openOrder: vi.fn(),
}));
vi.mock('@tanstack/react-start', () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => {
    let validate = (input: unknown) => input;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => { validate = fn; return builder; },
      handler: (fn: (args: {data: unknown}) => unknown) => (args: {data: unknown}) => fn({data:validate(args.data)}),
    };
    return builder;
  },
}));
vi.mock('@tanstack/react-start/server', () => ({getRequest: () => new Request('http://localhost:8080')}));
vi.mock('@/integrations/supabase/auth-middleware', () => ({requireSupabaseAuth:{}}));
vi.mock('./payments.server', () => ({openOrder:mocks.openOrder}));
vi.mock('./stripe.server', () => ({getStripeErrorMessage:(error: Error) => error.message}));
vi.mock('@/integrations/supabase/client.server', () => ({supabaseAdmin:{
  rpc: async () => ({data:'INV-TEST',error:null}),
  from: (table: string) => {
    const row = {id:'booking',artist_id:'artist',status:'quoted',total:mocks.total,paid_amount:mocks.paid,deposit_pct:mocks.depositPct,invoice_no:mocks.invoiceNo,start_time:null,end_time:null,client_email:null,package_title:'Host Event'};
    const chain = {
      select:() => chain, eq:() => chain, in:() => chain, is:() => chain,
      update:(values: Record<string, unknown>) => {mocks.writes.push(values); if(typeof values['invoice_no'] === 'string') mocks.invoiceNo = values['invoice_no']; return chain;},
      maybeSingle:async () => ({data:table === 'bookings' ? row : null,error:null}),
      single:async () => ({data:row,error:null}),
      then:(resolve:(result:{error:null}) => unknown) => Promise.resolve({error:null}).then(resolve),
    };
    return chain;
  },
}}));
import {acceptBookingOffer, acceptAndPay} from './bookings.functions';
const data = {id:'11111111-1111-4111-8111-111111111111',key:'22222222-2222-4222-8222-222222222222',agree:true};
beforeEach(() => {vi.clearAllMocks();mocks.invoiceNo=null;mocks.total=5250;mocks.paid=0;mocks.depositPct=100;mocks.writes=[];mocks.openOrder.mockResolvedValue({checkoutUrl:'https://checkout.stripe.com/c/pay/cs_test_booking',orderId:'order'});});
describe('booking invoice before checkout', () => {
  it('blocks direct checkout when the invoice has not been issued',async () => {
    expect(await acceptAndPay({data})).toEqual({error:'Invoice not yet issued. Accept the offer before paying.'});
    expect(mocks.openOrder).not.toHaveBeenCalled();expect(mocks.writes).toHaveLength(0);
  });
  it('issues on offer acceptance, then charges exactly 525000 fils without changing paid amounts',async () => {
    await acceptBookingOffer({data});
    expect(mocks.invoiceNo).toBe('INV-TEST');expect(mocks.openOrder).not.toHaveBeenCalled();
    await acceptAndPay({data});
    expect(mocks.openOrder).toHaveBeenCalledWith(expect.objectContaining({kind:'booking',amount_minor:525000}),expect.any(String),expect.any(Object),expect.any(String));
    expect(mocks.writes.every(write => !('paid_amount' in write))).toBe(true);
  });
  it('does not open a zero-value checkout even with an issued invoice',async () => {
    mocks.invoiceNo='INV-TEST';mocks.total=0;
    expect(await acceptAndPay({data})).toHaveProperty('error');expect(mocks.openOrder).not.toHaveBeenCalled();
  });
  it('returns a payment link for the invoice deposit, not a fixed AED 5000 charge',async () => {
    mocks.invoiceNo='INV-TEST';mocks.depositPct=20;
    expect(await acceptAndPay({data})).toEqual({checkoutUrl:'https://checkout.stripe.com/c/pay/cs_test_booking',orderId:'order'});
    expect(mocks.openOrder).toHaveBeenCalledWith(expect.objectContaining({kind:'booking',target_id:'booking',amount_minor:105000}),expect.any(String),expect.any(Object),expect.stringContaining('/booking/booking?k='));
    expect(mocks.writes.every(write => !('paid_amount' in write))).toBe(true);
  });
  it('creates the balance payment link for only the remaining invoice amount',async () => {
    mocks.invoiceNo='INV-TEST';mocks.depositPct=20;mocks.paid=1050;
    await acceptAndPay({data});
    expect(mocks.openOrder).toHaveBeenCalledWith(expect.objectContaining({kind:'booking',amount_minor:420000}),expect.any(String),expect.any(Object),expect.any(String));
    expect(mocks.writes.every(write => !('paid_amount' in write))).toBe(true);
  });
});