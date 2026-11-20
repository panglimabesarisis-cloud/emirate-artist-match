import {createStripeClient} from './stripe.server';
import {resolveOrCreateCustomer} from './payments.server';
import {PLAN_LOOKUP_KEYS,paidPlan,billingInterval,planDirection,verifiedPaidPeriod,type PaidPlan,type BillingInterval} from './billing-rules';
import {testProcessorAmount} from './processor-rules';
const db=async()=>(await import('@/integrations/supabase/client.server')).supabaseAdmin;
const iso=(n:number)=>new Date(n*1000).toISOString();
async function priceFor(code:PaidPlan,interval:BillingInterval){
 const stripe=createStripeClient('sandbox');
 const prices=await stripe.prices.list({lookup_keys:[PLAN_LOOKUP_KEYS[code][interval]],active:true});
 const price=prices.data[0];
 const database=await db();const {data:t,error}=await database.from('plan_tiers').select('*').eq('code',code).single();
 if(error||!t||!price)throw new Error('Plan price is not configured in the project’s Stripe test account');
 const fils=Math.round(Number(interval==='year'?t.price_yearly:t.price_monthly)*1.05*100);
 if(price.currency!=='idr'||price.unit_amount!==testProcessorAmount(fils)||price.recurring?.interval!==interval)throw new Error('Stripe plan price differs from the saved catalog; ask an administrator to synchronize prices');
 return price;
}
export async function openSubscription(artistId:string,userId:string,email:string|undefined,code:PaidPlan,interval:BillingInterval){
 const database=await db();const stripe=createStripeClient('sandbox');
 const {data:a}=await database.from('artists').select('registration_paid_at').eq('id',artistId).single();
 if(!a?.registration_paid_at)throw new Error('Pay your registration deposit first');
 const customer=await resolveOrCreateCustomer(stripe,{userId,email});
 const price=await priceFor(code,interval);
 const {data:r,error}=await database.rpc('begin_subscription_checkout',{_artist:artistId,_plan:code,_interval:interval,_customer:customer});
 if(error||!r)throw new Error(error?.message??'Could not reserve subscription checkout');
 if(r.plan_code!==code||r.billing_interval!==interval)throw new Error('Finish or cancel the pending subscription checkout before choosing another plan');
 if(r.session_id){const old=await stripe.checkout.sessions.retrieve(r.session_id);
  if(old.status==='open'&&old.client_secret)return {clientSecret:old.client_secret,sessionId:old.id};
  if(old.status==='complete'){await reconcileSubscriptionSession(old.id,artistId);throw new Error('Subscription payment completed; refresh your plan');}
  await database.from('subscription_checkouts').delete().eq('artist_id',artistId).eq('attempt_key',r.attempt_key);throw new Error('Checkout expired; try again');
 }
 const s=await stripe.checkout.sessions.create({mode:'subscription',ui_mode:'embedded_page',redirect_on_completion:'never',customer,line_items:[{price:price.id,quantity:1}],metadata:{artistId,userId},subscription_data:{metadata:{artistId,userId}}},{idempotencyKey:'subscription:'+r.attempt_key});
 if(!s.client_secret)throw new Error('Stripe did not return a checkout form');
 const save=await database.from('subscription_checkouts').update({session_id:s.id}).eq('artist_id',artistId).eq('attempt_key',r.attempt_key);if(save.error)throw new Error(save.error.message);
 return {clientSecret:s.client_secret,sessionId:s.id};
}
export async function reconcileSubscriptionSession(sessionId:string,artistId:string){
 const stripe=createStripeClient('sandbox');const s=await stripe.checkout.sessions.retrieve(sessionId);
 if(s.livemode||s.mode!=='subscription'||s.metadata?.['artistId']!==artistId)throw new Error('Subscription reference mismatch');
 if(s.status!=='complete'||s.payment_status==='unpaid'||!s.subscription)return {status:s.status==='expired'?'expired':'pending'};
 const subId=typeof s.subscription==='string'?s.subscription:s.subscription.id;
 await syncSubscription(subId);
 const database=await db();const {data:sub}=await database.from('artist_subscriptions').select('paid_until').eq('id',subId).single();
 return {status:sub?.paid_until&&Date.parse(sub.paid_until)>Date.now()?'paid':'pending'};
}
export async function syncSubscription(id:string){
 const stripe=createStripeClient('sandbox');const s=await stripe.subscriptions.retrieve(id);
 if(s.livemode)throw new Error('Live billing is disabled');
 const artistId=s.metadata['artistId'];const userId=s.metadata['userId'];if(!artistId||!userId)throw new Error('Missing subscription ownership');
 const database=await db();const {data:a}=await database.from('artists').select('id').eq('id',artistId).eq('user_id',userId).single();if(!a)throw new Error('Subscription owner mismatch');
 const customer=typeof s.customer==='string'?s.customer:s.customer.id;
 const c=await stripe.customers.retrieve(customer);if(c.deleted||c.metadata['userId']!==userId)throw new Error('Subscription customer mismatch');
 const item=s.items.data[0];if(!item||s.items.data.length!==1)throw new Error('Unexpected subscription items');
 const key=item.price.lookup_key;
 const code=key?.startsWith('pro_')?'pro':key?.startsWith('medium_')?'medium':null;
 if(!code||!Object.values(PLAN_LOOKUP_KEYS[code]).some(k=>k===key)||item.price.currency!=='idr'||item.quantity!==1)throw new Error('Unknown subscription price');
 const interval=billingInterval(item.price.recurring?.interval);
 const invoices=await stripe.invoices.list({subscription:id,limit:100});
 const periods:Array<{line_id:string;subscription_id:string;artist_id:string;plan_code:PaidPlan;period_start:string;period_end:string;priceId:string}>=[];
 for(const i of invoices.data){
  if(i.status!=='paid'||i.livemode)continue;
  const invoiceCustomer=typeof i.customer==='string'?i.customer:i.customer?.id??null;
  const invoiceSub=i.parent?.subscription_details?.subscription;
  const subscription=typeof invoiceSub==='string'?invoiceSub:invoiceSub?.id??null;
  const lines=i.lines.has_more?await stripe.invoices.listLineItems(i.id,{limit:100}).autoPagingToArray({limit:1000}):i.lines.data;
  for(const l of lines){
   const sub=l.parent?.subscription_item_details?.subscription??(typeof l.subscription==='string'?l.subscription:l.subscription?.id??null);
   const period=verifiedPaidPeriod({status:i.status,currency:i.currency,livemode:i.livemode,customer:invoiceCustomer,subscription},{currency:l.currency,livemode:l.livemode,amount:l.amount,quantity:l.quantity,subscription:sub,start:l.period.start,end:l.period.end},{customer,subscription:id});
   const priceRef=l.pricing?.price_details?.price;if(!period||!priceRef)continue;
   const price=typeof priceRef==='string'?await stripe.prices.retrieve(priceRef):priceRef;
   const plan=price.lookup_key?.startsWith('pro_')?'pro':price.lookup_key?.startsWith('medium_')?'medium':null;
   if(!plan||!Object.values(PLAN_LOOKUP_KEYS[plan]).some(k=>k===price.lookup_key)||price.currency!=='idr')continue;
   periods.push({line_id:l.id,subscription_id:id,artist_id:artistId,plan_code:plan,period_start:iso(period.start),period_end:iso(period.end),priceId:price.id});
  }
 }
 // A paid previous plan or unrelated invoice cannot activate an unpaid upgrade.
 const matching=periods.filter(p=>p.priceId===item.price.id&&Date.parse(p.period_end)>=item.current_period_end*1000);
 const until=matching.length?iso(item.current_period_end):null;
 const from=periods.length?new Date(Math.min(...periods.map(p=>Date.parse(p.period_start)))).toISOString():null;
 const {error}=await database.rpc('apply_test_subscription',{_state:{id:s.id,artist_id:artistId,customer_id:customer,plan_code:code,billing_interval:interval,status:s.status,period_start:iso(item.current_period_start),period_end:iso(item.current_period_end),paid_from:from,paid_until:until,cancel_at_period_end:s.cancel_at_period_end,schedule_id:typeof s.schedule==='string'?s.schedule:s.schedule?.id??null}});
 if(error)throw new Error(error.message);
 for(const {priceId:_,...period} of periods){const {error:e}=await database.from('billing_entitlement_periods').upsert(period,{onConflict:'line_id',ignoreDuplicates:true});if(e)throw new Error(e.message);}
 const allocation=await database.rpc('allocate_plan_month',{_artist:artistId,_month:new Date().toISOString().slice(0,7)+'-01'});if(allocation.error)throw new Error(allocation.error.message);
 for(const i of invoices.data){if(!i.id||i.livemode)continue;const {error:e}=await database.from('billing_invoices').upsert({id:i.id,subscription_id:s.id,artist_id:artistId,status:i.status??'draft',amount_minor:i.amount_paid,currency:i.currency,period_start:iso(i.period_start),period_end:iso(i.period_end),hosted_url:i.hosted_invoice_url??null,pdf_url:i.invoice_pdf??null});if(e)throw new Error(e.message);}
 if(s.status!=='incomplete')await database.from('subscription_checkouts').delete().eq('artist_id',artistId);
}
export async function changeSubscription(artistId:string,code:string,interval:BillingInterval){
 const database=await db();const {data:r}=await database.from('artist_subscriptions').select('*').eq('artist_id',artistId).not('status','in','(canceled,incomplete_expired)').order('created_at',{ascending:false}).limit(1).maybeSingle();
 if(!r)throw new Error('No active subscription');
 const stripe=createStripeClient('sandbox');const s=await stripe.subscriptions.retrieve(r.id);const item=s.items.data[0];if(!item)throw new Error('Subscription item missing');
 if(code==='free'){
  if(s.schedule){const scheduleId=typeof s.schedule==='string'?s.schedule:s.schedule.id;await stripe.subscriptionSchedules.release(scheduleId);}
  await stripe.subscriptions.update(s.id,{cancel_at_period_end:true});
  await database.from('artist_subscriptions').update({pending_plan:'free',pending_interval:null}).eq('id',s.id);
 }else{
  const next=paidPlan(code);const price=await priceFor(next,interval);
  if(next===r.plan_code&&interval===r.billing_interval){if(s.schedule){const scheduleId=typeof s.schedule==='string'?s.schedule:s.schedule.id;await stripe.subscriptionSchedules.release(scheduleId);}await stripe.subscriptions.update(s.id,{cancel_at_period_end:false});await database.from('artist_subscriptions').update({pending_plan:null,pending_interval:null}).eq('id',s.id);}
  else if(planDirection(r.plan_code,next)==='upgrade'){
   if(s.schedule){const scheduleId=typeof s.schedule==='string'?s.schedule:s.schedule.id;await stripe.subscriptionSchedules.release(scheduleId);}
   await stripe.subscriptions.update(s.id,{items:[{id:item.id,price:price.id}],cancel_at_period_end:false,proration_behavior:'always_invoice',payment_behavior:'pending_if_incomplete'});
  }else{
   const scheduleId=typeof s.schedule==='string'?s.schedule:s.schedule?.id;
   const schedule=scheduleId?await stripe.subscriptionSchedules.retrieve(scheduleId):await stripe.subscriptionSchedules.create({from_subscription:s.id});
   await stripe.subscriptionSchedules.update(schedule.id,{end_behavior:'release',phases:[{start_date:item.current_period_start,end_date:item.current_period_end,items:[{price:item.price.id,quantity:1}],proration_behavior:'none'},{start_date:item.current_period_end,items:[{price:price.id,quantity:1}],proration_behavior:'none'}]});
   await database.from('artist_subscriptions').update({pending_plan:next,pending_interval:interval}).eq('id',s.id);
  }
 }
 await syncSubscription(s.id);return {ok:true};
}
export async function portalFor(artistId:string,returnUrl:string){
 const database=await db();const {data:r}=await database.from('artist_subscriptions').select('customer_id').eq('artist_id',artistId).order('created_at',{ascending:false}).limit(1).maybeSingle();if(!r)throw new Error('No billing customer');
 const stripe=createStripeClient('sandbox');
 const configurations=await stripe.billingPortal.configurations.list({active:true,limit:100});
 let config=configurations.data.find(c=>c.metadata?.['dealmaker']==='test');
 if(!config)config=await stripe.billingPortal.configurations.create({metadata:{dealmaker:'test'},features:{invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'},customer_update:{enabled:true,allowed_updates:['email','name','address']}}});
 const session=await stripe.billingPortal.sessions.create({customer:r.customer_id,configuration:config.id,return_url:returnUrl});return {url:session.url};
}