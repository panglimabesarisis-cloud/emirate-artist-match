import { createStripeClient } from './stripe.server';
import { sandboxPaymentSettled } from './payment-rules';
import { testProcessorAmount } from './processor-rules';
export async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string | undefined; userId?: string | undefined },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error('Invalid userId');
  if (options.userId) {
    const found = await stripe.customers.search({ query: `metadata['userId']:'${options.userId}'`, limit: 1 });
    const first = found.data[0];
    if (first) return first.id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    const customer = existing.data[0];
    if (customer) {
      if (options.userId && customer.metadata?.['userId'] !== options.userId) await stripe.customers.update(customer.id, {metadata: {...customer.metadata, userId: options.userId}});
      return customer.id;
    }
  }
  const created = await stripe.customers.create({...(options.email && {email:options.email}), ...(options.userId && {metadata:{userId:options.userId}})});
  return created.id;
}
export async function openOrder(order: {artist_id:string; kind:'credits'|'deposit'|'invoice'|'booking'|'agent_prompt'|'flow_template'|'order_form_template'; target_id?:string; package_id?:string; plan_code?:string; credits?:number; amount_minor:number}, description:string, identity:{userId?:string | undefined;email?:string | undefined}, _returnUrl:string) {
  // Validate before creating a customer or performing any payment-side writes.
  const processorAmount = testProcessorAmount(order.amount_minor);
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const stripe=createStripeClient('sandbox');
  const customer=identity.userId||identity.email?await resolveOrCreateCustomer(stripe,identity):undefined;
  const purchaseKey=[order.artist_id,order.kind,order.target_id??order.package_id??'registration',order.amount_minor,customer??'guest'].join(':');
  const {data:o,error}=await db.rpc('begin_test_purchase',{_order:{...order,processor_amount_minor:processorAmount,processor_currency:'idr'},_customer:customer??'',_key:purchaseKey});
  if(error||!o)throw new Error(error?.message??'Could not create payment');
  try {
    if(o.stripe_session_id){
      const existing=await stripe.checkout.sessions.retrieve(o.stripe_session_id);
      if(existing.status==='open'&&existing.client_secret)return {clientSecret:existing.client_secret,orderId:o.id};
      if(existing.status==='complete'){await reconcileOrder(o.id);throw new Error('Payment already completed; refresh your balance');}
      await db.from('payment_orders').update({status:'expired'}).eq('id',o.id);
      throw new Error('Previous checkout expired. Try again.');
    }
    const session=await stripe.checkout.sessions.create({mode:'payment',ui_mode:'embedded_page',redirect_on_completion:'never',...(customer ? {customer} : {}),
      line_items:[{price_data:{currency:'idr',product_data:{name:description},unit_amount:Number(o.processor_amount_minor),tax_behavior:'inclusive'},quantity:1}],
      payment_intent_data:{description},metadata:{orderId:o.id,...(identity.userId?{userId:identity.userId}:{})}}, {idempotencyKey:o.id});
    const {error:saveError}=await db.from('payment_orders').update({stripe_session_id:session.id}).eq('id',o.id);
    if(saveError)throw new Error(saveError.message);
    if(!session.client_secret)throw new Error('Stripe did not return a client secret');
    return {clientSecret:session.client_secret,orderId:o.id};
  } catch(e) { const {getStripeErrorMessage}=await import('./stripe.server');await db.from('payment_orders').update({last_error:getStripeErrorMessage(e)}).eq('id',o.id); throw e; }
}
export async function reconcileOrder(id:string) {
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const {data:o}=await db.from('payment_orders').select('*').eq('id',id).single();
  if(!o)throw new Error('Payment not found');
  if(o.status==='paid'){await processPaymentFollowup(o.id);return {status:'paid'};}
  if(!o.stripe_session_id)return {status:o.status};
  const s=await createStripeClient('sandbox').checkout.sessions.retrieve(o.stripe_session_id);
  if(s.metadata?.['orderId']!==o.id)throw new Error('Payment reference mismatch');
  const customer=typeof s.customer==='string'?s.customer:s.customer?.id;
  if(s.mode!=='payment'||(o.stripe_customer_id&&customer!==o.stripe_customer_id))throw new Error('Payment identity mismatch');
  if(sandboxPaymentSettled(s)){ const {error}=await db.rpc('settle_test_purchase',{_id:o.id,_session:s.id,_amount:s.amount_total??0,_currency:s.currency??''}); if(error)throw new Error(error.message);
    await db.from('payment_orders').update({stripe_payment_intent_id:typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent?.id??null}).eq('id',o.id);
    await processPaymentFollowup(o.id);
    return {status:'paid'};
  }
  if(s.status==='expired')await db.from('payment_orders').update({status:'expired'}).eq('id',o.id).neq('status','paid');
  return {status:s.status==='expired'?'expired':'pending'};
}
export async function processPaymentFollowup(orderId:string){
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const {data:f}=await db.from('payment_followups').select('*').eq('order_id',orderId).maybeSingle();
  if(!f)return;
  const {syncBookingCalendar}=await import('./booking-calendar.server');
  await syncBookingCalendar(f.booking_id).catch(e=>console.error('Calendar retry failed',e));
  const {data:claimed}=await db.rpc('claim_payment_followup',{_id:orderId});if(!claimed)return;
  try{const {notifyTeamPaid}=await import('./bookings.functions');await notifyTeamPaid(f.booking_id);await db.from('payment_followups').update({status:'sent',last_error:null}).eq('order_id',orderId);}
  catch(e){await db.from('payment_followups').update({status:'failed',last_error:e instanceof Error?e.message:'Notification failed'}).eq('order_id',orderId);}
}
