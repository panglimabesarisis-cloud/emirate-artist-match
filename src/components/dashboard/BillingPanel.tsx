import {useState} from 'react';
import {checkoutUrl} from '@/lib/hosted-checkout';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {toast} from 'sonner';
import {supabase} from '@/integrations/supabase/client';
import {subscriptionCheckout,updateSubscription,refreshBilling,billingPortal} from '@/lib/billing.functions';
import {Button} from '@/components/ui/button';
import {useI18n} from '@/lib/i18n';
export function BillingPanel({artistId}:{artistId:string}){
 const {t:tr}=useI18n();
 const qc=useQueryClient();const checkout$=useServerFn(subscriptionCheckout);const change$=useServerFn(updateSubscription);const refresh$=useServerFn(refreshBilling);const portal$=useServerFn(billingPortal);
 const [interval,setInterval]=useState<'month'|'year'>('month');const [busy,setBusy]=useState(false);
 const {data}=useQuery({queryKey:['billing',artistId],queryFn:async()=>{
  const [tiers,subscriptions,invoices,a,plan]=await Promise.all([supabase.from('plan_tiers').select('*').order('sort'),supabase.from('artist_subscriptions').select('*').eq('artist_id',artistId).eq('environment','sandbox').order('created_at',{ascending:false}),supabase.from('billing_invoices').select('*').eq('artist_id',artistId).order('created_at',{ascending:false}).limit(20),supabase.from('artists').select('registration_paid_at').eq('id',artistId).single(),supabase.rpc('effective_artist_plan',{_artist:artistId})]);
  for(const r of [tiers,subscriptions,invoices,a,plan])if(r.error)throw new Error(r.error.message);
  return {tiers:tiers.data??[],subscription:subscriptions.data?.find(s=>!['canceled','incomplete_expired'].includes(s.status)),invoices:invoices.data??[],registered:!!a.data?.registration_paid_at,plan:plan.data??'free'};
 }});
 const run=async(f:()=>Promise<unknown>)=>{setBusy(true);try{await f();await qc.invalidateQueries();}catch(e){toast.error(e instanceof Error?e.message:'Billing failed');}finally{setBusy(false);}};
 const pick=(plan:string)=>run(async()=>{
  if(data?.subscription){const r=await change$({data:{plan,interval}});if('error'in r)throw new Error(r.error);toast.success(plan==='free'?'Cancellation scheduled at period end':'Plan change saved');}
  else {const r=await checkout$({data:{plan,interval}});if('error'in r)throw new Error(r.error);window.location.assign(checkoutUrl({id:r.sessionId,livemode:false,url:r.checkoutUrl}));}
 });
 return <section className="space-y-5 border-b pb-6">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-3xl">{tr('Your plan')}</h2><div className="flex gap-2"><Button size="sm" variant={interval==='month'?'default':'outline'} onClick={()=>setInterval('month')}>{tr('Monthly')}</Button><Button size="sm" variant={interval==='year'?'default':'outline'} onClick={()=>setInterval('year')}>{tr('Yearly')}</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>run(async()=>{const r=await refresh$();if('error'in r)throw new Error(r.error);})}>{tr('Refresh billing')}</Button></div></div>
  {data?.subscription&&<div className="text-sm text-muted-foreground"><p>{tr("Status:")} {tr(data.subscription.status)} · {tr("Paid through")} {data.subscription.paid_until?new Date(data.subscription.paid_until).toLocaleDateString('en-GB'):tr('not paid')}</p>{data.subscription.pending_plan&&<p>{tr("Next period:")} {tr(data.subscription.pending_plan)}</p>}{data.subscription.cancel_at_period_end&&<p>{tr('Cancellation at period end')}</p>}<Button className="mt-2" size="sm" variant="outline" disabled={busy} onClick={()=>run(async()=>{const r=await portal$();if('error'in r)throw new Error(r.error);window.open(r.url,'_blank','noopener,noreferrer');})}>{tr('Manage payment method & invoices')}</Button></div>}
  {!data?.registered&&<p role="status" className="text-sm text-muted-foreground">{tr('Registration deposit required before a paid subscription.')}</p>}
  <div className="studio-credit-packs">{data?.tiers.map(t=><div key={t.code} className="studio-credit-pack"><h3 className="font-display text-2xl">{tr(t.name)}</h3><p className="mt-2 text-xl">AED {Number(interval==='year'?t.price_yearly:t.price_monthly).toLocaleString('en-US')}<span className="text-sm text-muted-foreground">/{tr(interval==='year'?'yr':'mo')} + 5% {tr('VAT')}</span></p><p className="mt-2 text-sm text-muted-foreground">{t.ai_credits} {tr("credits / month")} · {t.commission_pct}% {tr("commission")}</p><Button className="mt-3 w-full whitespace-normal" disabled={busy||(!data.registered&&t.code!=='free')||(!data.subscription&&t.code==='free')} variant={data.plan===t.code?'outline':'default'} onClick={()=>pick(t.code)}>{data.plan===t.code&&!data.subscription?tr('Current plan'):t.code==='free'?tr('Cancel at period end'):data.subscription?tr('Change plan'):tr('Subscribe · test payment')}</Button></div>)}</div>
  <h3 className="font-semibold">{tr('Billing history')}</h3>{data?.invoices.length===0&&<p className="text-sm text-muted-foreground">{tr('No subscription invoices yet.')}</p>}<div className="divide-y">{data?.invoices.map(i=><div className="flex flex-wrap justify-between gap-2 py-3 text-sm" key={i.id}><span>{new Date(i.period_start).toLocaleDateString('en-GB')} · {tr(i.status)}</span><span>{i.currency.toUpperCase()} {(i.amount_minor/100).toLocaleString('en-US')}</span>{i.pdf_url&&<a className="underline" href={i.pdf_url} target="_blank" rel="noreferrer">{tr('Invoice PDF')}</a>}</div>)}</div>
 </section>;
}
