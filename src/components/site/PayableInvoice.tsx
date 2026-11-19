import {useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {invoiceCheckout} from '@/lib/payments.functions';
import type {Invoice} from '@/lib/invoice';
import {InvoiceCard} from './InvoiceCard';
import {SandboxCheckout,type CheckoutSession} from './SandboxCheckout';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
export function PayableInvoice({inv,conversationId,linkKey,status}:{inv:Invoice;conversationId:string;linkKey:string;status?:string | undefined}){
 const start$=useServerFn(invoiceCheckout);const qc=useQueryClient();const [session,setSession]=useState<CheckoutSession|null>(null);const [busy,setBusy]=useState(false);
 const start=async()=>{if(!inv.id)return;setBusy(true);try{const r=await start$({data:{invoiceId:inv.id,conversationId,key:linkKey}});if('error'in r)throw new Error(r.error);setSession(r);}catch(e){toast.error(e instanceof Error?e.message:'Checkout failed');}finally{setBusy(false);}};
 return <div className="space-y-3"><InvoiceCard inv={inv}/>{inv.id&&<Badge variant={status==='paid'?'default':'secondary'}>{status==='paid'?'Paid':'Unpaid'}</Badge>}{inv.id&&status!=='paid'&&(session?<SandboxCheckout session={session} linkKey={linkKey} onPaid={()=>{setSession(null);qc.invalidateQueries({queryKey:['chat',conversationId]});toast.success('Invoice payment verified');}}/>:<Button disabled={busy} onClick={start}>{busy?'Opening checkout…':'Pay invoice · Stripe sandbox'}</Button>)}</div>;
}
