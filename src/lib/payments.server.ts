import { createStripeClient } from './stripe.server';
import { sandboxPaymentSettled } from './payment-rules';
async function resolveOrCreateCustomer(
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
export async function openOrder(order: {artist_id:string; kind:'credits'|'deposit'|'invoice'|'booking'; target_id?:string; package_id?:string; plan_code?:string; credits?:number; amount_minor:number}, description:string, identity:{userId?:string | undefined;email?:string | undefined}, _returnUrl:string) {
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const stripe=createStripeClient('sandbox');
  const customer=identity.userId||identity.email?await resolveOrCreateCustomer(stripe,identity):undefined;
  const {data:o,error}=await db.from('payment_orders').insert(order).select('id').single();
  if(error||!o)throw new Error(error?.message??'Could not create payment');
  try {
    const session=await stripe.checkout.sessions.create({mode:'payment',ui_mode:'embedded_page',redirect_on_completion:'never',...(customer ? {customer} : {}),
      line_items:[{price_data:{currency:'idr',product_data:{name:description},unit_amount:Math.round(order.amount_minor/100),tax_behavior:'inclusive'},quantity:1}],
      payment_intent_data:{description},metadata:{orderId:o.id,...(identity.userId?{userId:identity.userId}:{})}}, {idempotencyKey:o.id});
    const {error:saveError}=await db.from('payment_orders').update({stripe_session_id:session.id}).eq('id',o.id);
    if(saveError)throw new Error(saveError.message);
    if(!session.client_secret)throw new Error('Stripe did not return a client secret');
    return {clientSecret:session.client_secret,orderId:o.id};
  } catch(e) { await db.from('payment_orders').update({status:'failed'}).eq('id',o.id); throw e; }
}
export async function reconcileOrder(id:string) {
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const {data:o}=await db.from('payment_orders').select('*').eq('id',id).single();
  if(!o)throw new Error('Payment not found');
  if(o.status==='paid'){if(o.kind==='booking'&&o.target_id){const {syncBookingCalendar}=await import('./booking-calendar.server');await syncBookingCalendar(o.target_id);}return {status:'paid'};}
  if(!o.stripe_session_id)return {status:o.status};
  const s=await createStripeClient('sandbox').checkout.sessions.retrieve(o.stripe_session_id);
  if(s.metadata?.['orderId']!==o.id)throw new Error('Payment reference mismatch');
  if(sandboxPaymentSettled(s)){ const {data:changed,error}=await db.rpc('settle_sandbox_order',{_id:o.id,_session:s.id,_amount:s.amount_total??0,_currency:s.currency??''}); if(error)throw new Error(error.message);
    if(o.kind==='booking'&&o.target_id){const {syncBookingCalendar}=await import('./booking-calendar.server');await syncBookingCalendar(o.target_id);}
    if(changed&&o.kind==='booking'&&o.target_id){const {notifyTeamPaid}=await import('./bookings.functions'); await notifyTeamPaid(o.target_id).catch(e=>console.error('Payment notification failed',e));}
    return {status:'paid'};
  }
  if(s.status==='expired')await db.from('payment_orders').update({status:'expired'}).eq('id',o.id).neq('status','paid');
  return {status:s.status==='expired'?'expired':'pending'};
}
