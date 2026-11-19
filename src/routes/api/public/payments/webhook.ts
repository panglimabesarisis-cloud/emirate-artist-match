import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/public/payments/webhook')({server:{handlers:{POST:async({request})=>{
 if(new URL(request.url).searchParams.get('env')!=='sandbox')return Response.json({ignored:true});
 try {const {verifyWebhook,createStripeClient}=await import('@/lib/stripe.server');const e=await verifyWebhook(request,'sandbox');
 if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(e.type)){const s=await createStripeClient('sandbox').checkout.sessions.retrieve(e.data.object.id);if(s.metadata?.['orderId']){const {reconcileOrder}=await import('@/lib/payments.server');await reconcileOrder(s.metadata['orderId']);}}
 return Response.json({received:true});}catch(e){console.error('Sandbox webhook failed',e);return Response.json({error:'Webhook failed'},{status:400});}
}}}});
