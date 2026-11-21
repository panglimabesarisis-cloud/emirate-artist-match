import {createServerFn} from '@tanstack/react-start';
import {getRequest} from '@tanstack/react-start/server';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {TOPUP_PACKAGES} from './masking';
import {joinPaymentTotal} from './join-rules';
import {getStripeErrorMessage} from './stripe.server';
import {ITEM_KINDS,itemAmountMinor,tierAllowed,type ItemKind} from './billing-rules';
const id=(v:string)=>{if(!/^[0-9a-f-]{36}$/i.test(v))throw new Error('Invalid reference');return v;};
export const artistCheckout=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:{kind:'credits'|'deposit'|ItemKind;packageId?:string;plan?:string;itemId?:string})=>i).handler(async({data,context})=>{
 try {
  const {data:a}=await context.supabase.from('artists').select('id,plan').eq('user_id',context.userId).single();if(!a)throw new Error('Artist profile required');
  const {data:{user}}=await context.supabase.auth.getUser();
  const {openOrder}=await import('./payments.server');
  const returnUrl=new URL('/join/payment',getRequest().url).href;
  if(data.kind==='credits'){const p=TOPUP_PACKAGES.find(p=>p.id===data.packageId);if(!p)throw new Error('Unknown credit package'); return await openOrder({artist_id:a.id,kind:'credits',package_id:p.id,credits:p.credits,amount_minor:Math.round(p.priceAed*1.05*100)},`Dealmaker ${p.credits} AI credits (incl. VAT 5%)`,{userId:context.userId,email:user?.email},returnUrl);}
  if((ITEM_KINDS as readonly string[]).includes(data.kind)){
   const kind=data.kind as ItemKind;const itemId=id(data.itemId??'');
   const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
   const {data:plan}=await db.rpc('effective_artist_plan',{_artist:a.id});
   let title:string,price:number,tier:string|null=null;
   if(kind==='agent_prompt'){const {data:p}=await db.from('agent_prompts').select('title,price_aed,tier,is_active').eq('id',itemId).maybeSingle();if(!p?.is_active)throw new Error('Item unavailable');title=p.title;price=Number(p.price_aed);tier=p.tier;}
   else if(kind==='flow_template'){const {data:t}=await db.from('ai_flow_templates').select('name,price_aed,published').eq('id',itemId).maybeSingle();if(!t?.published)throw new Error('Item unavailable');title=t.name;price=Number(t.price_aed);}
   else {const {data:t}=await db.from('order_form_templates').select('name,price_aed,tier,is_active').eq('id',itemId).maybeSingle();if(!t?.is_active)throw new Error('Item unavailable');title=t.name;price=Number(t.price_aed);tier=t.tier;}
   if(!tierAllowed(String(plan??'free'),tier))throw new Error('Your plan does not include this item');
   const owned=kind==='agent_prompt'?(await db.from('agent_prompt_purchases').select('artist_id').eq('artist_id',a.id).eq('prompt_id',itemId).not('paid_at','is',null).is('refunded_at',null).maybeSingle()).data
    :kind==='flow_template'?(await db.from('ai_flow_template_purchases').select('artist_id').eq('artist_id',a.id).eq('template_id',itemId).not('paid_at','is',null).is('refunded_at',null).maybeSingle()).data
    :(await db.from('order_form_template_purchases').select('artist_id').eq('artist_id',a.id).eq('template_id',itemId).not('paid_at','is',null).is('refunded_at',null).maybeSingle()).data;
   if(owned)throw new Error('You already own this item');
   return await openOrder({artist_id:a.id,kind,target_id:itemId,credits:0,amount_minor:itemAmountMinor(price)},`Dealmaker ${title} (incl. VAT 5%)`,{userId:context.userId,email:user?.email},returnUrl);
  }
  if(data.kind!=='deposit')throw new Error('Invalid purchase');
  const {data:t}=await context.supabase.from('plan_tiers').select('code,ai_credits').eq('code',data.plan??a.plan).single();if(!t)throw new Error('Unknown plan');
  const {data:paid}=await context.supabase.from('payment_orders').select('id').eq('artist_id',a.id).eq('kind','deposit').eq('status','paid').maybeSingle();if(paid)throw new Error('Registration deposit already paid');
  return await openOrder({artist_id:a.id,kind:'deposit',plan_code:t.code,credits:0,amount_minor:Math.round(joinPaymentTotal().total*100)},'Dealmaker registration deposit (incl. VAT 5%)',{userId:context.userId,email:user?.email},returnUrl);
 }catch(e){return {error:getStripeErrorMessage(e)};}
});
export const invoiceCheckout=createServerFn({method:'POST'}).inputValidator((i:{invoiceId:string;conversationId:string;key:string})=>({invoiceId:id(i.invoiceId),conversationId:id(i.conversationId),key:id(i.key)})).handler(async({data})=>{
 try {const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');const {data:c}=await db.from('conversations').select('id,quote_requests(email,client_user_id)').eq('id',data.conversationId).eq('access_key',data.key).single();if(!c)throw new Error('Invalid chat link');
 const {data:inv}=await db.from('service_invoices').select('*').eq('id',data.invoiceId).eq('conversation_id',c.id).single();if(!inv||inv.status==='paid')throw new Error('Invoice unavailable or already paid');
 if(inv.booking_id){const {data:b}=await db.from('bookings').select('id,access_key,status').eq('id',inv.booking_id).eq('conversation_id',c.id).single();if(!b||!['quoted','confirmed'].includes(b.status))throw new Error('Booking is not available for payment');return {bookingUrl:`/booking/${b.id}?k=${b.access_key}`};}
 const {openOrder}=await import('./payments.server');return await openOrder({artist_id:inv.artist_id,kind:'invoice',target_id:inv.id,amount_minor:Math.round(Number(inv.total)*100)},`Dealmaker invoice ${inv.number}`,{email:c.quote_requests?.email??undefined,userId:c.quote_requests?.client_user_id??undefined},new URL(`/chat/${c.id}?k=${data.key}`,getRequest().url).href);
 }catch(e){return {error:getStripeErrorMessage(e)};}
});
export const checkArtistPayment=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((i:{orderId:string})=>({orderId:id(i.orderId)})).handler(async({data,context})=>{try{const {data:o}=await context.supabase.from('payment_orders').select('id').eq('id',data.orderId).single();if(!o)throw new Error('Payment not found');const {reconcileOrder}=await import('./payments.server');return await reconcileOrder(o.id);}catch(e){return {error:getStripeErrorMessage(e)};}});
export const checkLinkPayment=createServerFn({method:'POST'}).inputValidator((i:{orderId:string;key:string})=>({orderId:id(i.orderId),key:id(i.key)})).handler(async({data})=>{try{const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');const {data:o}=await db.from('payment_orders').select('*').eq('id',data.orderId).single();if(!o||!o.target_id)throw new Error('Payment not found');
 if(o.kind==='invoice'){const {data:inv}=await db.from('service_invoices').select('conversation_id').eq('id',o.target_id).single();const {data:c}=await db.from('conversations').select('id').eq('id',inv?.conversation_id??'').eq('access_key',data.key).maybeSingle();if(!c)throw new Error('Invalid chat link');}
 else if(o.kind==='booking'){const {data:b}=await db.from('bookings').select('id').eq('id',o.target_id).eq('access_key',data.key).maybeSingle();if(!b)throw new Error('Invalid booking link');}else throw new Error('Invalid payment');
 const {reconcileOrder}=await import('./payments.server');return await reconcileOrder(o.id);}catch(e){return {error:getStripeErrorMessage(e)};}});
