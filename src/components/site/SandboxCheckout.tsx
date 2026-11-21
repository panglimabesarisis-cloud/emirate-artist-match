import {useEffect,useState} from 'react';
import {validateHostedUrl} from '@/lib/hosted-checkout';
export type CheckoutSession={checkoutUrl:string;orderId:string};
export function PaymentTestModeBanner(){return <div className="border-b border-gold/40 bg-accent px-4 py-2 text-center text-sm text-accent-foreground">Stripe sandbox · No real money is charged.</div>;}
export function SandboxCheckout({session}:{session:CheckoutSession;linkKey?:string;onPaid:()=>void}){
 const [error,setError]=useState('');
 useEffect(()=>{
   try{
     // The server validates the test session; also restrict the browser destination.
     const url=validateHostedUrl(session.checkoutUrl);
     window.location.assign(url);
   }catch(e){setError(e instanceof Error?e.message:'Checkout unavailable');}
 },[session.checkoutUrl]);
 return <section className="min-w-0 border bg-card"><PaymentTestModeBanner />{error&&<p role="alert" className="p-4 text-destructive">{error}</p>}</section>;
}
