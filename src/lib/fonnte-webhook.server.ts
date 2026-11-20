import { timingSafeEqual } from 'node:crypto';
import { fonntePayload, fonnteDecision, fonnteTimestamp } from './fonnte-rules';
import { internationalPhone } from './whatsapp-provider';

export async function authenticateFonnte(request: Request, secret: string | undefined) {
  if(!secret) return {error:'Not configured',status:503} as const;
  const reader=request.body?.getReader();
  if(!reader) return {error:'Invalid payload',status:400} as const;
  const chunks:Uint8Array[]=[]; let size=0;
  while(true){
    const {done,value}=await reader.read(); if(done) break;
    size+=value.length;
    if(size>32768){await reader.cancel();return {error:'Payload too large',status:413} as const;}
    chunks.push(value);
  }
  const raw=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
  let input:unknown;
  try {input=JSON.parse(new TextDecoder().decode(raw));} catch {return {error:'Invalid payload',status:400} as const;}
  const parsed=fonntePayload.safeParse(input);
  if(!parsed.success) return {error:'Invalid payload',status:400} as const;
  const data=parsed.data;
  // Device webhooks may omit a body secret. Use a dedicated webhook credential,
  // never the outbound Fonnte API token or a claimed device/sender number.
  const urlSecrets=new URL(request.url).searchParams.getAll('secret');
  const supplied=[data.secret, request.headers.get('x-fonnte-webhook-secret'), ...urlSecrets].filter((value):value is string=>value!==undefined && value!==null);
  if(urlSecrets.length>1 || supplied.length===0 || supplied.some(value=>value.length<16 || value.length>512))return {error:'Unauthorized',status:401} as const;
  const hash=async(text:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
  const expected=await hash(secret);
  for(const credential of supplied){
    if(!timingSafeEqual(await hash(credential),expected))return {error:'Unauthorized',status:401} as const;
  }
  // No group member can approve on behalf of a registered artist.
  if(data.member || data.sender.includes('@') || data.sender.includes('-'))return {ignored:true} as const;
  const decision=fonnteDecision(data.message || data.text);
  if(!decision)return {ignored:true} as const;
  try {
    const messageAt=fonnteTimestamp(data.timestamp);
    const age=Date.now()-Date.parse(messageAt);
    if(age < -120000 || age>15*60000)return {ignored:true} as const;
    return {event:{delivery_id:`${data.device}:${data.inboxid}`,sender:internationalPhone(data.sender),decision:decision.decision,reference:decision.code,message_at:messageAt}} as const;
  } catch {return {error:'Invalid payload',status:400} as const;}
}

export async function processFonnteEvent(id:string,origin:string) {
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const {error:applyError}=await db.rpc('apply_fonnte_approval',{_event:id});
  if(applyError)throw applyError;
  const {data:e,error}=await db.from('fonnte_approval_events').select('*').eq('id',id).single();
  if(error||!e)throw new Error('Event read failed');
  if(e.processed_at || e.effects_state==='unresolved')return;
  if(e.effects_state==='running') {
    if(e.effects_started_at && Date.now()-Date.parse(e.effects_started_at)>120000) {
      const {error:writeError}=await db.from('fonnte_approval_events').update({effects_state:'unresolved',processing_error:'Interrupted workflow; review before retrying'}).eq('id',id).eq('effects_state','running');
      if(writeError)throw writeError;
    }
    return;
  }
  const {data:claim,error:claimError}=await db.from('fonnte_approval_events').update({effects_state:'running',effects_started_at:new Date().toISOString()}).eq('id',id).eq('effects_state','pending').select('id').maybeSingle();
  if(claimError)throw claimError; if(!claim)return;
  try {
    if(e.booking_id && (e.outcome==='approved'||e.outcome==='declined')) {
      const {finishWhatsAppDecision}=await import('./booking-decision.server');
      await finishWhatsAppDecision(e.booking_id,e.outcome==='approved'?'yes':'no');
    }
    let message = e.outcome==='approved' ? 'Booking approved. The client has been notified.' : e.outcome==='declined' ? 'Booking declined.' : e.outcome==='ambiguous' ? 'You have multiple pending bookings. Reply YES or NO followed by the 8-character reference in the booking message.' : 'No matching pending booking. Please use the original approval link.';
    if(e.outcome==='invoice_required' && e.booking_id) {
      const {data:b,error:bookingError}=await db.from('bookings').select('artist_key').eq('id',e.booking_id).single();
      if(bookingError||!b)throw new Error('Booking read failed');
      message=`Availability acknowledged; booking is not yet approved. Complete invoice items to approve and continue: ${origin}/approve/${e.booking_id}?k=${b.artist_key}`;
    }
    const {sendWhatsApp}=await import('./whatsapp-provider.server');
    const result=await sendWhatsApp(e.sender,'Dealmaker booking response',message,'');
    const {error:replyError}=await db.from('fonnte_approval_events').update({reply_status:result.status,reply_id:result.messageId ?? null}).eq('id',id);
    if(replyError)throw replyError;
    if(result.status!=='accepted')throw new Error('Confirmation send unresolved; inspect provider before retrying');
    const {error:doneError}=await db.from('fonnte_approval_events').update({effects_state:'done',processed_at:new Date().toISOString(),processing_error:null}).eq('id',id);
    if(doneError)throw doneError;
  } catch {
    const {error:writeError}=await db.from('fonnte_approval_events').update({effects_state:'unresolved',processing_error:'Workflow or confirmation interrupted; inspect records before retrying'}).eq('id',id);
    if(writeError)throw writeError;
    throw new Error('Fonnte workflow incomplete');
  }
}

export async function recoverFonnteEvents(origin:string) {
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const {data:rows,error}=await db.from('fonnte_approval_events').select('id').is('processed_at',null).in('effects_state',['pending','running']).lte('retry_at',new Date().toISOString()).order('retry_at').limit(5);
  if(error)throw error;
  for(const row of rows??[]) {
    const {error:deferError}=await db.from('fonnte_approval_events').update({retry_at:new Date(Date.now()+60000).toISOString()}).eq('id',row.id);
    if(deferError)throw deferError;
    try {await processFonnteEvent(row.id,origin);}catch {/* Durable failure state is retained for review. */}
  }
}