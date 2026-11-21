import {beforeEach,describe,expect,it,vi} from 'vitest';
import {openSubscription} from './billing.server';
import {PLAN_LOOKUP_KEYS} from './billing-rules';
import {testProcessorAmount} from './processor-rules';

const mocks=vi.hoisted(()=>({create:vi.fn(),retrieve:vi.fn(),expire:vi.fn(),prices:vi.fn(),rpc:vi.fn(),save:vi.fn()}));
vi.mock('./stripe.server',()=>({createStripeClient:()=>({prices:{list:mocks.prices},checkout:{sessions:{create:mocks.create,retrieve:mocks.retrieve,expire:mocks.expire}}})}));
vi.mock('./payments.server',()=>({resolveOrCreateCustomer:async()=> 'cus_test_owner'}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{
  rpc:mocks.rpc,
  from:(table:string)=>({
    select:()=>({eq:()=>({single:async()=>({data:table==='artists'?{registration_paid_at:'2026-11-21'}:{price_monthly:199,price_yearly:1990},error:null})})}),
    update:mocks.save,
    delete:()=>({eq:()=>({eq:async()=>({error:null})})}),
  }),
}}));

beforeEach(()=>{
  vi.clearAllMocks();
  mocks.prices.mockResolvedValue({data:[{id:'price_existing',currency:'idr',unit_amount:testProcessorAmount(20895),recurring:{interval:'month'}}]});
  mocks.rpc.mockResolvedValue({data:{plan_code:'medium',billing_interval:'month',attempt_key:'attempt-1',session_id:null},error:null});
  mocks.save.mockReturnValue({eq:()=>({eq:async()=>({error:null})})});
  mocks.create.mockResolvedValue({id:'cs_test_subscription',livemode:false,url:'https://checkout.stripe.com/c/pay/cs_test_subscription'});
});

describe('hosted subscription checkout',()=>{
  const open=()=>openSubscription('artist-1','user-1',undefined,'medium','month','https://dealmakertalent.com/dashboard');
  it('preserves catalog pricing, owner metadata and the durable attempt key',async()=>{
    expect(await open()).toEqual({checkoutUrl:'https://checkout.stripe.com/c/pay/cs_test_subscription',sessionId:'cs_test_subscription'});
    expect(mocks.prices).toHaveBeenCalledWith({lookup_keys:[PLAN_LOOKUP_KEYS.medium.month],active:true});
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({mode:'subscription',ui_mode:'hosted_page',payment_method_collection:'always',customer:'cus_test_owner',line_items:[{price:'price_existing',quantity:1}],metadata:{artistId:'artist-1',userId:'user-1'},subscription_data:{metadata:{artistId:'artist-1',userId:'user-1'}}}),{idempotencyKey:'subscription:attempt-1'});
  });
  it('reuses an existing hosted session rather than creating a second checkout',async()=>{
    mocks.rpc.mockResolvedValue({data:{plan_code:'medium',billing_interval:'month',attempt_key:'attempt-1',session_id:'cs_test_existing'},error:null});
    mocks.retrieve.mockResolvedValue({id:'cs_test_existing',livemode:false,status:'open',url:'https://checkout.stripe.com/c/pay/cs_test_existing'});
    expect(await open()).toHaveProperty('sessionId','cs_test_existing');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('expires an old embedded session before allowing a retry',async()=>{
    mocks.rpc.mockResolvedValue({data:{plan_code:'medium',billing_interval:'month',attempt_key:'attempt-1',session_id:'cs_test_existing'},error:null});
    mocks.retrieve.mockResolvedValue({id:'cs_test_existing',livemode:false,status:'open',url:null});
    await expect(open()).rejects.toThrow('Checkout expired');
    expect(mocks.expire).toHaveBeenCalledWith('cs_test_existing');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('still rejects a configured Stripe price that differs from the saved catalog',async()=>{
    mocks.prices.mockResolvedValue({data:[{id:'price_wrong',currency:'idr',unit_amount:1,recurring:{interval:'month'}}]});
    await expect(open()).rejects.toThrow('differs from the saved catalog');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});