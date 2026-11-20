import {useEffect,useMemo,useRef,useState} from 'react';
import {EmbeddedCheckoutProvider,EmbeddedCheckout} from '@stripe/react-stripe-js';
import {useServerFn} from '@tanstack/react-start';
import {getStripe} from '@/lib/stripe';
import {checkArtistPayment,checkLinkPayment} from '@/lib/payments.functions';
import {Button} from '@/components/ui/button';
import {PaidStamp} from './PaidStamp';
export type CheckoutSession={clientSecret:string;orderId:string};
export function PaymentTestModeBanner(){return <div className="border-b border-gold/40 bg-accent px-4 py-2 text-center text-sm text-accent-foreground">Stripe sandbox · No real money is charged.</div>;}
export function SandboxCheckout({session,linkKey,onPaid}:{session:CheckoutSession;linkKey?:string;onPaid:()=>void}){
 const artist$=useServerFn(checkArtistPayment);const link$=useServerFn(checkLinkPayment);
 const [error,setError]=useState('');const [completed,setCompleted]=useState(false);const [verified,setVerified]=useState(false);
 const paidCallback=useRef(onPaid);paidCallback.current=onPaid;
 const stripe=useMemo(()=>{try{return getStripe();}catch(e){return e instanceof Error?e.message:'Stripe unavailable';}},[]);
 const options=useMemo(()=>({clientSecret:session.clientSecret,onComplete:()=>setCompleted(true)}),[session.clientSecret]);
 useEffect(()=>{
   if(!completed||verified)return;
   let cancelled=false;let checking=false;
   const check=async()=>{
     if(checking)return;checking=true;
     try{
       const r=linkKey?await link$({data:{orderId:session.orderId,key:linkKey}}):await artist$({data:{orderId:session.orderId}});
       if(cancelled)return;
       if('error'in r)setError(r.error);
       else if(r.status==='paid'){setError('');setVerified(true);}
     }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Payment check failed');}
     finally{checking=false;}
   };
   void check();const timer=setInterval(check,3000);
   return()=>{cancelled=true;clearInterval(timer);};
 },[completed,verified,session.orderId,linkKey]);
 useEffect(()=>{if(!verified)return;const timer=setTimeout(()=>paidCallback.current(),1100);return()=>clearTimeout(timer);},[verified]);
 if(verified)return <section className="min-w-0 border bg-card"><PaymentTestModeBanner /><div className="flex flex-col items-center gap-3 p-8"><PaidStamp /><p className="text-sm text-muted-foreground">Payment verified</p></div></section>;
 return <section className="min-w-0 border bg-card"><PaymentTestModeBanner />{typeof stripe==='string'?<p role="alert" className="p-4 text-destructive">{stripe}</p>:<EmbeddedCheckoutProvider stripe={stripe} options={options}><EmbeddedCheckout /></EmbeddedCheckoutProvider>}{completed&&<p className="p-3 text-sm">Verifying payment with Stripe…</p>}{error&&<p role="alert" className="p-3 text-sm text-destructive">{error}</p>}<Button variant="ghost" className="m-3" onClick={()=>setCompleted(true)}>Check payment status</Button></section>;
}
