import {createFileRoute,Link,Navigate} from '@tanstack/react-router';
import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {toast} from 'sonner';
import {artistCheckout} from '@/lib/payments.functions';
import {joinPaymentTotal} from '@/lib/join-rules';
import {planLater,type Receipt} from '@/lib/receipt';
import {PublicLayout} from '@/components/site/PublicLayout';
import {SandboxCheckout,PaymentTestModeBanner,type CheckoutSession} from '@/components/site/SandboxCheckout';
import {ReceiptSheet} from '@/components/site/ReceiptSheet';
import {Button} from '@/components/ui/button';
import {aed} from '@/lib/format';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/hooks/use-auth';
export const Route=createFileRoute('/join_/payment')({head:()=>({meta:[{title:'Registration deposit | Dealmaker'},{name:'description',content:'Pay your AED 100 registration deposit plus VAT with Dealmaker Stripe sandbox.'},{property:'og:title',content:'Registration deposit | Dealmaker'},{property:'og:description',content:'Review your talent registration invoice and pay the deposit.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:PaymentPage});
function PaymentPage(){
 const {user,loading}=useAuth();
 const pay$=useServerFn(artistCheckout);const [chosen,setChosen]=useState<string|null>(null);const [session,setSession]=useState<CheckoutSession|null>(null);const [busy,setBusy]=useState(false);
 const [issued]=useState(()=>new Date().toISOString());
 useEffect(()=>{setChosen(localStorage.getItem('join_plan'));},[]);
 const account=useQuery({queryKey:['join-invoice',user?.id,chosen],enabled:!!user,queryFn:async()=>{
  const artist=await supabase.rpc('private_artists').select('id,stage_name,intended_plan,registration_paid_at').eq('user_id',user!.id).maybeSingle();
  if(artist.error)throw new Error(artist.error.message);
  const code=chosen??artist.data?.intended_plan??'free';
  const tier=await supabase.from('plan_tiers').select('code,name,price_monthly').eq('code',code).maybeSingle();
  if(tier.error)throw new Error(tier.error.message);
  return {artist:artist.data,tier:tier.data,code};
 }});
 const t=joinPaymentTotal();
 const data=account.data;
 const receipt:Receipt|null=data?.artist?{number:'DM-DRAFT',issued,paidAt:null,status:'unpaid',billTo:data.artist.stage_name,billEmail:user?.email??null,artist:null,
  lines:[{label:'Talent registration deposit',detail:'One-time, for every plan',amount:t.subtotal}],subtotal:t.subtotal,vat:t.vat,total:t.total,
  later:planLater(data.tier?{name:data.tier.name,monthly:Number(data.tier.price_monthly)}:null)}:null;
 const pay=async()=>{setBusy(true);try{const r=await pay$({data:{kind:'deposit',plan:data?.code??'free'}});if('error'in r)throw new Error(r.error);setSession(r);}catch(e){toast.error(e instanceof Error?e.message:'Checkout unavailable');}finally{setBusy(false);}};
 // /join continues with the rate card step, or goes to the dashboard when it is already filled.
 if(data?.artist?.registration_paid_at)return <Navigate to="/join" replace />;
 return <PublicLayout><PaymentTestModeBanner /><main className="mx-auto max-w-3xl space-y-6 px-4 py-10"><h1 className="text-center text-3xl font-semibold">Step 5 · Registration deposit</h1>
  {loading||(user&&account.isPending)?<p role="status" className="text-center">Loading your invoice…</p>
  :!user?<div className="flex justify-center"><Button asChild><Link to="/auth" search={{redirect:'/join/payment'}}>Sign in to pay registration</Link></Button></div>
  :account.error?<p role="alert" className="text-center text-destructive">Could not load your invoice. Refresh the page.</p>
  :!receipt?<div className="space-y-4 text-center"><p>Finish your talent registration first.</p><Button asChild><Link to="/join">Continue registration</Link></Button></div>
  :<><ReceiptSheet receipt={receipt}/><div className="flex justify-center">{session?<SandboxCheckout session={session} onPaid={()=>{}}/>:<Button disabled={busy} onClick={pay} className="h-12 rounded-full bg-gradient-gold px-8 font-bold text-gold-foreground">{busy?'Opening checkout…':`Pay ${aed(t.total)} · Stripe test payment`}</Button>}</div></>}
 </main></PublicLayout>;
}
