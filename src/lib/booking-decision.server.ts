import { getRequest } from '@tanstack/react-start/server';
import { artistDecisionBranch, type FlowNode, type FlowEdge } from './ai-flow';

const admin=async()=>(await import('@/integrations/supabase/client.server')).supabaseAdmin;

export async function sendClientLink(bookingId:string) {
  const db=await admin();
  const {notifyBooking,siteOrigin}=await import('./notify.server');
  const {data:b,error}=await db.from('bookings').select('id,access_key,client_email,client_phone,package_title,event_date,total,conversation_id,artists(stage_name)').eq('id',bookingId).single();
  if(error||!b)throw new Error('Booking read failed');
  let phone=b.client_phone;
  if(!phone&&b.conversation_id){
    const {data:c,error:chatError}=await db.from('conversations').select('quote_requests(phone)').eq('id',b.conversation_id).single();
    if(chatError)throw chatError;
    phone=c?.quote_requests?.phone??null;
  }
  await notifyBooking(b.id,'client','booking_link',{email:b.client_email,phone},`${b.artists?.stage_name} approved your booking`,`${b.package_title} on ${b.event_date}, AED ${Number(b.total).toLocaleString('en-US')} incl. VAT`,`${siteOrigin(getRequest())}/booking/${b.id}?k=${b.access_key}`);
}

export async function resumeArtistDecision(b:{id:string;artist_id:string;conversation_id:string|null},decision:'yes'|'no') {
  if(!b.conversation_id)return false;
  const db=await admin();
  const {data:flows,error}=await db.from('ai_flows').select('artist_id,enabled,nodes,edges').or(`artist_id.is.null,artist_id.eq.${b.artist_id}`);
  if(error)throw new Error('Could not load artist flow');
  const flow=flows?.find(f=>f.artist_id===b.artist_id&&f.enabled)??flows?.find(f=>f.artist_id===null);
  if(!flow||!Array.isArray(flow.nodes)||!Array.isArray(flow.edges))return false;
  if(!artistDecisionBranch(flow.nodes as FlowNode[],flow.edges as FlowEdge[],decision))return false;
  const {error:modeError}=await db.from('conversations').update({mode:'ai',last_message_at:new Date().toISOString()}).eq('id',b.conversation_id);
  if(modeError)throw new Error('Could not resume chat');
  const {runAgent}=await import('./agent.server');
  await runAgent(b.conversation_id,b.id);
  return true;
}

export async function finishWhatsAppDecision(id:string,decision:'yes'|'no') {
  const db=await admin();
  const {data:b,error}=await db.from('bookings').select('id,artist_id,conversation_id,status').eq('id',id).single();
  if(error||!b)throw new Error('Booking not found');
  if(decision==='yes'&&b.status!=='quoted')throw new Error('Approval not committed');
  if(decision==='no'&&b.status!=='cancelled')throw new Error('Decline not committed');
  if(decision==='yes')await sendClientLink(b.id);
  if(!await resumeArtistDecision(b,decision)&&decision==='no'&&b.conversation_id){
    const {error:updateError}=await db.from('conversations').update({mode:'human',last_message_at:new Date().toISOString()}).eq('id',b.conversation_id);
    if(updateError)throw updateError;
  }
}