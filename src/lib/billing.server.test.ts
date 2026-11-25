import {beforeEach,describe,expect,it,vi} from 'vitest';
import {openSubscription} from './billing.server';
import {PLAN_LOOKUP_KEYS,planOfPrice} from './billing-rules';
import {testProcessorAmount} from './processor-rules';

const mocks=vi.hoisted(()=>({create:vi.fn(),retrieve:vi.fn(),expire:vi.fn(),prices:vi.fn(),newPrice:vi.fn(),tag:vi.fn(),rpc:vi.fn(),save:vi.fn()}));
vi.mock('./stripe.server',()=>({createStripeClient:()=>({prices:{list:mocks.prices,create:mocks.newPrice,update:mocks.tag},checkout:{sessions:{create:mocks.create,retrieve:mocks.retrieve,expire:mocks.expire}}})}));
vi.mock('./payments.server',()=>({resolveOrCreateCustomer:async()=> 'cus_test_owner'}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{
  rpc:mocks.rpc,
  from:(table:string)=>({
    select:()=>({eq:()=>({single:async()=>({data:table==='artists'?{registration_paid_at:'2026-11-21'}:{name:'Medium',price_monthly:199,price_yearly:1990},error:null})})}),
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
  it('creates the missing test price from the saved catalog, once per amount',async()=>{
    mocks.prices.mockResolvedValue({data:[]});
    mocks.newPrice.mockResolvedValue({id:'price_new',currency:'idr',unit_amount:testProcessorAmount(20895),recurring:{interval:'month'}});
    await open();
    expect(mocks.newPrice).toHaveBeenCalledWith({currency:'idr',unit_amount:testProcessorAmount(20895),recurring:{interval:'month'},lookup_key:'medium_monthly',metadata:{planCode:'medium'},tax_behavior:'inclusive',product_data:{name:'Dealmaker Medium plan (monthly)'}},{idempotencyKey:`plan-price:medium_monthly:${testProcessorAmount(20895)}:new`});
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({line_items:[{price:'price_new',quantity:1}]}),{idempotencyKey:'subscription:attempt-1'});
  });
  it('sells the new price after an admin changes it, keeping the old one recognisable',async()=>{
    mocks.prices.mockResolvedValue({data:[{id:'price_old',currency:'idr',unit_amount:1,recurring:{interval:'month'}}]});
    mocks.newPrice.mockResolvedValue({id:'price_changed'});
    await open();
    expect(mocks.tag).toHaveBeenCalledWith('price_old',{metadata:{planCode:'medium'}});
    expect(mocks.newPrice).toHaveBeenCalledWith(expect.objectContaining({unit_amount:testProcessorAmount(20895),lookup_key:'medium_monthly',transfer_lookup_key:true}),{idempotencyKey:`plan-price:medium_monthly:${testProcessorAmount(20895)}:price_old`});
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({line_items:[{price:'price_changed',quantity:1}]}),{idempotencyKey:'subscription:attempt-1'});
    expect(planOfPrice({lookup_key:null,metadata:{planCode:'medium'}})).toBe('medium');
    expect(planOfPrice({lookup_key:'pro_yearly'})).toBe('pro');
    expect(planOfPrice({lookup_key:'other',metadata:{planCode:'free'}})).toBeNull();
  });
});