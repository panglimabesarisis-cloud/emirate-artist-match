import {createStripeClient,getStripeErrorMessage} from './stripe.server';
export async function receivePaymentEvent(event:{id:string;type:string;data:{object:{id:string}}}){
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const {error}=await db.from('payment_event_inbox').upsert({id:event.id,event_type:event.type,payload:JSON.parse(JSON.stringify(event))},{onConflict:'id',ignoreDuplicates:true});if(error)throw new Error(error.message);
 await processPaymentEvent(event.id);
}
export async function processPaymentEvent(id:string){
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const {data:e}=await db.from('payment_event_inbox').select('*').eq('id',id).single();if(!e||e.status==='processed')return;
 const event=e.payload as unknown as {data:{object:{id:string}}};const objectId=event.data.object.id;
 try{
  const stripe=createStripeClient('sandbox');
  if(e.event_type.startsWith('checkout.session.')){
   const s=await stripe.checkout.sessions.retrieve(objectId);if(s.livemode)throw new Error('Live payments disabled');
   if(s.mode==='subscription'&&s.subscription){const {syncSubscription}=await import('./billing.server');await syncSubscription(typeof s.subscription==='string'?s.subscription:s.subscription.id);}
   else if(s.metadata?.['orderId']){
    const orderId=s.metadata['orderId'];
    if(e.event_type==='checkout.session.async_payment_failed')await db.from('payment_orders').update({status:'failed',last_error:'Stripe async payment failed'}).eq('id',orderId).eq('status','pending');
    else {const {reconcileOrder}=await import('./payments.server');await reconcileOrder(orderId);}
   }
  }else if(e.event_type.startsWith('customer.subscription.')){const {syncSubscription}=await import('./billing.server');await syncSubscription(objectId);}
  else if(e.event_type.startsWith('invoice.')){
   const invoice=await stripe.invoices.retrieve(objectId);if(invoice.livemode)throw new Error('Live billing disabled');
   const sub=invoice.parent?.subscription_details?.subscription;
   if(sub){const {syncSubscription}=await import('./billing.server');await syncSubscription(typeof sub==='string'?sub:sub.id);}
  }else if(e.event_type==='charge.refunded'){
   const charge=await stripe.charges.retrieve(objectId);if(charge.livemode)throw new Error('Live refund disabled');
   const paymentIntent=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;
   if(paymentIntent){const {data:order}=await db.from('payment_orders').select('id').eq('stripe_payment_intent_id',paymentIntent).maybeSingle();if(order){const {recordTestRefund}=await import('./refunds.server');await recordTestRefund(order.id,charge.amount_refunded);}}
  }else if(e.event_type.startsWith('charge.dispute.')){
   const dispute=await stripe.disputes.retrieve(objectId);if(dispute.livemode)throw new Error('Live disputes disabled');
   const intent=typeof dispute.payment_intent==='string'?dispute.payment_intent:dispute.payment_intent?.id;
   if(intent)await db.from('payment_orders').update({last_error:`Stripe test dispute ${dispute.id}: ${dispute.status}`}).eq('stripe_payment_intent_id',intent);
  }
  await db.from('payment_event_inbox').update({status:'processed',attempted_at:new Date().toISOString(),last_error:null}).eq('id',id);
 }catch(err){await db.from('payment_event_inbox').update({status:'failed',attempted_at:new Date().toISOString(),last_error:getStripeErrorMessage(err)}).eq('id',id);throw err;}
}
export async function runPaymentRecovery(){
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const {data:events}=await db.from('payment_event_inbox').select('id').in('status',['pending','failed']).order('created_at').limit(30);
 for(const e of events??[])await processPaymentEvent(e.id).catch(err=>console.error('Payment event retry',getStripeErrorMessage(err)));
 const {data:orders}=await db.from('payment_orders').select('id').eq('status','pending').not('stripe_session_id','is',null).order('created_at').limit(30);
 const {reconcileOrder,processPaymentFollowup}=await import('./payments.server');
 for(const o of orders??[])await reconcileOrder(o.id).catch(err=>console.error('Order retry',getStripeErrorMessage(err)));
 const {data:followups}=await db.from('payment_followups').select('order_id').in('status',['pending','failed']).limit(30);
 for(const f of followups??[])await processPaymentFollowup(f.order_id);
 const {data:subscriptions}=await db.from('artist_subscriptions').select('id').not('status','in','(canceled,incomplete_expired)').limit(100);
 const {syncSubscription}=await import('./billing.server');for(const s of subscriptions??[])await syncSubscription(s.id).catch(err=>console.error('Billing retry',getStripeErrorMessage(err)));
 const {data:artists}=await db.from('artists').select('id,created_at').limit(1000);
 for(const a of artists??[]){const first=new Date(a.created_at);const now=new Date();let month=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),1));let count=0;while(month<=now&&count++<120){const {error}=await db.rpc('allocate_plan_month',{_artist:a.id,_month:month.toISOString().slice(0,10)});if(error)throw new Error(error.message);month=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,1));}const {data:plan}=await db.rpc('effective_artist_plan',{_artist:a.id});if(plan)await db.from('artists').update({plan}).eq('id',a.id);}
}