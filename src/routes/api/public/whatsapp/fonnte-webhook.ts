import {createFileRoute} from '@tanstack/react-router';

export const Route=createFileRoute('/api/public/whatsapp/fonnte-webhook')({server:{handlers:{POST:async({request})=>{
  const {authenticateFonnte,processFonnteEvent,recoverFonnteEvents}=await import('@/lib/fonnte-webhook.server');
  const result=await authenticateFonnte(request,process.env['FONNTE_WEBHOOK_SECRET']);
  if(result.error)return Response.json({error:result.error},{status:result.status ?? 400});
  if('ignored' in result)return Response.json({received:true});
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const {error:insertError}=await db.from('fonnte_approval_events').upsert(result.event,{onConflict:'delivery_id',ignoreDuplicates:true});
  if(insertError)return Response.json({error:'Storage failed'},{status:500});
  const {data:event,error}=await db.from('fonnte_approval_events').select('id').eq('delivery_id',result.event.delivery_id).single();
  if(error||!event)return Response.json({error:'Storage failed'},{status:500});
  try {
    const origin=new URL(request.url).origin;
    await processFonnteEvent(event.id,origin);
    await recoverFonnteEvents(origin);
    return Response.json({received:true});
  }catch{return Response.json({error:'Processing incomplete'},{status:500});}
}}}});