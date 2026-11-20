import {createStripeClient,getStripeErrorMessage} from './stripe.server';
export async function recordTestRefund(orderId:string,amount:number){const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');const {error}=await db.rpc('record_test_refund',{_order:orderId,_processor:amount});if(error)throw new Error(error.message);}
export async function refundBookingTest(bookingId:string,aedAmount:number){
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const {data:orders}=await db.from('payment_orders').select('*').eq('target_id',bookingId).eq('kind','booking').eq('status','paid').order('created_at');
 if(!orders?.length)return false;
 let remaining=Math.round(aedAmount*100);const stripe=createStripeClient('sandbox');
 for(const o of orders){if(remaining<=0)break;if(!o.stripe_payment_intent_id)throw new Error('Paid order lacks verified Stripe payment reference; refund needs review');
  const accounting=Math.min(remaining,o.amount_minor-o.refunded_accounting_amount);if(accounting<=0)continue;
  const processor=Math.round(accounting*Number(o.processor_amount_minor)/o.amount_minor);
  const intent=await stripe.paymentIntents.retrieve(o.stripe_payment_intent_id);if(intent.livemode)throw new Error('Live refunds disabled');
  const key=`test-refund:${o.id}:${o.refunded_accounting_amount}:${accounting}`;
  const {data:existing}=await db.from('test_refunds').select('*').eq('order_id',o.id).eq('status','pending').maybeSingle();
  if(existing&&existing.accounting_amount!==accounting)throw new Error('Another refund is pending review');
  let row=existing;if(!row){const {data:r,error}=await db.from('test_refunds').insert({order_id:o.id,processor_amount:processor,accounting_amount:accounting}).select('*').single();if(error||!r)throw new Error(error?.message??'Could not reserve refund');row=r;}
  try{const r=await stripe.refunds.create({payment_intent:intent.id,amount:processor},{idempotencyKey:key});await db.from('test_refunds').update({stripe_refund_id:r.id,status:r.status??'pending'}).eq('id',row.id);if(r.status==='succeeded'){const charge=await stripe.charges.retrieve(typeof intent.latest_charge==='string'?intent.latest_charge:intent.latest_charge?.id??'');await recordTestRefund(o.id,charge.amount_refunded);}else throw new Error('Stripe test refund is pending; wait for reconciliation');}
  catch(e){await db.from('test_refunds').update({last_error:getStripeErrorMessage(e)}).eq('id',row.id);throw e;}
  remaining-=accounting;
 }
 if(remaining>0)throw new Error('Refund exceeds available test payments');return true;
}