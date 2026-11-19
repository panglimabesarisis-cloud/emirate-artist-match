import {useEffect,useMemo,useState} from 'react';
import {EmbeddedCheckoutProvider,EmbeddedCheckout} from '@stripe/react-stripe-js';
import {useServerFn} from '@tanstack/react-start';
import {getStripe} from '@/lib/stripe';
import {checkArtistPayment,checkLinkPayment} from '@/lib/payments.functions';
import {Button} from '@/components/ui/button';
export type CheckoutSession={clientSecret:string;orderId:string};
export function PaymentTestModeBanner(){return <div className="border-b border-gold/40 bg-accent px-4 py-2 text-center text-sm text-accent-foreground">Stripe sandbox · No real money is charged.</div>;}
export function SandboxCheckout({session,linkKey,onPaid}:{session:CheckoutSession;linkKey?:string;onPaid:()=>void}){
 const artist$=useServerFn(checkArtistPayment);const link$=useServerFn(checkLinkPayment);
 const [error,setError]=useState('');const [completed,setCompleted]=useState(false);
 const stripe=useMemo(()=>{try{return getStripe();}catch(e){return e instanceof Error?e.message:'Stripe unavailable';}},[]);
 const options=useMemo(()=>({clientSecret:session.clientSecret,onComplete:()=>setCompleted(true)}),[session.clientSecret]);
 useEffect(()=>{if(!completed)return;let cancelled=false;const check=async()=>{try{const r=linkKey?await link$({data:{orderId:session.orderId,key:linkKey}}):await artist$({data:{orderId:session.orderId}});if('error'in r){if(!cancelled)setError(r.error);}else if(r.status==='paid'&&!cancelled)onPaid();}catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Payment check failed');}};void check();const timer=setInterval(check,3000);return()=>{cancelled=true;clearInterval(timer);};},[completed,session.orderId,linkKey]);
 return <section className="min-w-0 border bg-card"><PaymentTestModeBanner />{typeof stripe==='string'?<p role="alert" className="p-4 text-destructive">{stripe}</p>:<EmbeddedCheckoutProvider stripe={stripe} options={options}><EmbeddedCheckout /></EmbeddedCheckoutProvider>}{completed&&<p className="p-3 text-sm">Verifying payment with Stripe…</p>}{error&&<p role="alert" className="p-3 text-sm text-destructive">{error}</p>}<Button variant="ghost" className="m-3" onClick={()=>setCompleted(true)}>Check payment status</Button></section>;
}
