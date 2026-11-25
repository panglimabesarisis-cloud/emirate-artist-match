import {createFileRoute, Link} from '@tanstack/react-router';
import {useEffect, useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {useAuth} from '@/hooks/use-auth';
import {checkArtistPayment, checkLinkPayment} from '@/lib/payments.functions';
import {checkSubscription} from '@/lib/billing.functions';
import {paymentReturnPath} from '@/lib/hosted-checkout';
import {PublicLayout} from '@/components/site/PublicLayout';
import {PaymentTestModeBanner} from '@/components/site/SandboxCheckout';
import {PaidStamp} from '@/components/site/PaidStamp';
import {ReceiptSheet} from '@/components/site/ReceiptSheet';
import type {Receipt} from '@/lib/receipt';
import {afterPaymentPath} from '@/lib/after-payment';
import {Button} from '@/components/ui/button';
import {useI18n} from '@/lib/i18n';

export const Route = createFileRoute('/checkout-return')({
  head:()=>({meta:[
    {title:'Payment status | Dealmaker'},
    {name:'description',content:'Verify your Dealmaker sandbox payment securely before returning to your booking or workspace.'},
    {property:'og:title',content:'Payment status | Dealmaker'},
    {property:'og:description',content:'Review the verified status of your Dealmaker test payment.'},
    {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary'},
    {name:'robots',content:'noindex, nofollow'},
  ]}),
  validateSearch:(search:Record<string,unknown>)=>({
    returnTo:paymentReturnPath(typeof search['returnTo']==='string'?search['returnTo']:'/dashboard'),
    orderId:typeof search['orderId']==='string'?search['orderId']:'',
    sessionId:typeof search['session_id']==='string'?search['session_id']:'',
    subscription:search['subscription']==='true',
  }),
  component:CheckoutReturn,
});

function CheckoutReturn(){
  const {t}=useI18n();
  const {returnTo,orderId,sessionId,subscription}=Route.useSearch();
  const {user,loading}=useAuth();
  const artistCheck=useServerFn(checkArtistPayment);
  const linkCheck=useServerFn(checkLinkPayment);
  const subscriptionCheck=useServerFn(checkSubscription);
  const [status,setStatus]=useState('pending');
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const [receipt,setReceipt]=useState<Receipt|null>(null);
  const [chatPath,setChatPath]=useState<string|null>(null);
  const key=new URL(returnTo,'https://dealmakertalent.com').searchParams.get('k');
  const needsSignIn=(!key||subscription)&&!user;
  useEffect(()=>{
    setStatus('pending');setError('');setReceipt(null);setChatPath(null);
    if(loading||needsSignIn)return;
    let active=true; let running=false; let attempts=0;
    const check=async()=>{
      if(running)return;
      if(attempts>=20){clearInterval(timer);return;}
      running=true;attempts++;
      try{
        if(subscription&&!user)throw new Error('Sign in to verify your subscription.');
        if(!subscription&&!orderId)throw new Error('Missing payment reference.');
        const response=subscription?await subscriptionCheck({data:{sessionId}})
          :key?await linkCheck({data:{orderId,key}}):await artistCheck({data:{orderId}});
        if(!active)return;
        if('error' in response){setError(response.error);clearInterval(timer);}
        else {setStatus(response.status);setReceipt(response.receipt??null);setChatPath('chatPath' in response&&typeof response.chatPath==='string'?response.chatPath:null);setError('');if(response.status==='paid'||response.status==='expired')clearInterval(timer);}
      }catch(e){if(active){setError(e instanceof Error?e.message:'Payment verification unavailable.');clearInterval(timer);}}
      finally{running=false;}
    };
    const timer=setInterval(()=>{void check();},3000);
    void check();
    return()=>{active=false;clearInterval(timer);};
  },[loading,needsSignIn,user?.id,orderId,sessionId,subscription,key,retry]);
  // A booking or invoice payer goes straight back to the chat, where the paid invoice is waiting.
  useEffect(()=>{
    if(status!=='paid'||!chatPath)return;
    const timer=setTimeout(()=>window.location.replace(chatPath),2000);
    return()=>clearTimeout(timer);
  },[status,chatPath]);
  const authReturn='/checkout-return?'+new URLSearchParams({returnTo,orderId,session_id:sessionId,subscription:String(subscription)}).toString();
  return <PublicLayout><PaymentTestModeBanner /><main className="mx-auto max-w-3xl space-y-5 px-4 py-10">
    <h1 className="font-display text-3xl">{t('Payment status')}</h1>
    {loading?<p role="status">{t('Loading account…')}</p>:needsSignIn?<Button asChild><Link to="/auth" search={{redirect:authReturn}}>{t('Sign in to verify payment')}</Link></Button>
      :status==='paid'?<><p role="status" className="text-center">{t('Payment verified')}{chatPath?` · ${t('Returning to your chat…')}`:''}</p>{receipt?<ReceiptSheet receipt={receipt}/>:<div className="flex justify-center"><PaidStamp /></div>}</>
      :<><p role="status">{t(status==='expired'?'Checkout expired. No payment has been confirmed.':'Payment has not been confirmed yet.')}</p>{error&&<p role="alert" className="text-destructive">{t(error)}</p>}<Button variant="outline" onClick={()=>setRetry(n=>n+1)}>{t('Check payment status')}</Button></>}
    <div className="flex justify-center"><Button asChild className={status==='paid'?'rounded-full bg-gradient-gold px-8 font-bold text-gold-foreground':'rounded-full'}><a href={status==='paid'?chatPath??afterPaymentPath(returnTo,!!user):returnTo}>{t(status!=='paid'?'Return':chatPath?'Back to chat':'Continue')}</a></Button></div>
  </main></PublicLayout>;
}