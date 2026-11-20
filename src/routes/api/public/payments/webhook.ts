import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/public/payments/webhook')({server:{handlers:{POST:async({request})=>{
 if(new URL(request.url).searchParams.get('env')!=='sandbox')return Response.json({ignored:true});
 try {const {verifyWebhook}=await import('@/lib/stripe.server');const e=await verifyWebhook(request,'sandbox');
 const {receivePaymentEvent}=await import('@/lib/payment-events.server');await receivePaymentEvent(e);
 return Response.json({received:true});}catch(e){console.error('Sandbox webhook failed',e);return Response.json({error:'Webhook failed'},{status:400});}
}}}});
