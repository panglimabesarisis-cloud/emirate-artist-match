import {createFileRoute,Link} from '@tanstack/react-router';
import {useEffect,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {toast} from 'sonner';
import {artistCheckout} from '@/lib/payments.functions';
import {joinPaymentTotal} from '@/lib/join-rules';
import {PublicLayout} from '@/components/site/PublicLayout';
import {SandboxCheckout,PaymentTestModeBanner,type CheckoutSession} from '@/components/site/SandboxCheckout';
import {Button} from '@/components/ui/button';
import {PaidStamp} from '@/components/site/PaidStamp';
import {aed} from '@/lib/format';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/hooks/use-auth';
export const Route=createFileRoute('/join_/payment')({head:()=>({meta:[{title:'Registration deposit | Dealmaker'},{name:'description',content:'Pay your AED 100 registration deposit plus VAT with Dealmaker Stripe sandbox.'},{property:'og:title',content:'Registration deposit | Dealmaker'},{property:'og:description',content:'Review your talent registration deposit and payment status.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:PaymentPage});
function PaymentPage(){
 const {user,loading}=useAuth();
 const pay$=useServerFn(artistCheckout);const [plan,setPlan]=useState('free');const [session,setSession]=useState<CheckoutSession|null>(null);const [paid,setPaid]=useState(false);const [busy,setBusy]=useState(false);
 useEffect(()=>{setPlan(localStorage.getItem('join_plan')??'free');},[]);
 useEffect(()=>{if(!user)return;void supabase.from('artists').select('registration_paid_at').eq('user_id',user.id).maybeSingle().then(({data})=>setPaid(!!data?.registration_paid_at));},[user?.id]);
 const t=joinPaymentTotal();
 const pay=async()=>{setBusy(true);try{const r=await pay$({data:{kind:'deposit',plan}});if('error'in r)throw new Error(r.error);setSession(r);}catch(e){toast.error(e instanceof Error?e.message:'Checkout unavailable');}finally{setBusy(false);}};
 return <PublicLayout><PaymentTestModeBanner /><main className="mx-auto max-w-3xl space-y-6 px-4 py-10"><h1 className="text-3xl font-semibold">Registration deposit</h1><section className="space-y-3 border-b pb-6"><p className="capitalize">{plan} plan · subscription paid separately</p><div className="flex justify-between"><span>Deposit</span><span>{aed(t.subtotal)}</span></div><div className="flex justify-between"><span>VAT 5%</span><span>{aed(t.vat)}</span></div><div className="flex justify-between font-semibold"><span>Total</span><span>{aed(t.total)}</span></div></section>{loading?<p>Loading account…</p>:!user?<Button asChild><Link to="/auth" search={{redirect:'/join/payment'}}>Sign in to pay registration</Link></Button>:paid?<section><div className="mb-4"><PaidStamp /></div><h2 className="text-xl font-semibold">Registration payment verified</h2><Button asChild className="mt-4"><Link to="/dashboard">Choose subscription in dashboard</Link></Button></section>:session?<SandboxCheckout session={session} onPaid={()=>{setPaid(true);}}/>:<Button disabled={busy} onClick={pay}>{busy?'Opening checkout…':`Pay ${aed(t.total)} · Stripe test payment`}</Button>}</main></PublicLayout>;
}
