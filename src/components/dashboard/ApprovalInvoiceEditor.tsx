import {useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {toast} from 'sonner';
import {Plus,Trash2} from 'lucide-react';
import {approveArtistInvoice} from '@/lib/bookings.functions';
import {buildInvoice,type InvoiceItem} from '@/lib/invoice';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {InvoiceCard} from '@/components/site/InvoiceCard';
export function ApprovalInvoiceEditor({id,linkKey,initial,onSent}:{id:string;linkKey:string;initial:InvoiceItem[];onSent:()=>void}){
 const [items,setItems]=useState<InvoiceItem[]>(initial.length?initial:[{title:'',qty:1,price:0}]);const [busy,setBusy]=useState(false);const send$=useServerFn(approveArtistInvoice);
 let preview=null;try{preview=buildInvoice('Draft',items,null,null);}catch{}
 const change=(i:number,values:Partial<InvoiceItem>)=>setItems(old=>old.map((x,j)=>i===j?{...x,...values}:x));
 return <div className="grid min-w-0 gap-6 lg:grid-cols-2"><section className="min-w-0 space-y-4"><h2 className="font-semibold">Fill invoice items</h2>{items.map((item,i)=><div key={i} className="space-y-2 border-b pb-4"><Label htmlFor={`item-${i}`}>Service description</Label><Input id={`item-${i}`} maxLength={120} value={item.title} onChange={e=>change(i,{title:e.target.value})}/><div className="grid grid-cols-[80px_1fr_40px] gap-2"><div><Label>Qty</Label><Input aria-label={`Quantity ${i+1}`} type="number" min={1} max={99} value={item.qty} onChange={e=>change(i,{qty:Number(e.target.value)})}/></div><div><Label>Price (AED)</Label><Input aria-label={`Price ${i+1}`} type="number" min={0} step="0.01" value={item.price} onChange={e=>change(i,{price:Number(e.target.value)})}/></div><Button variant="ghost" size="icon" className="self-end" aria-label={`Remove item ${i+1}`} onClick={()=>setItems(old=>old.filter((_,j)=>i!==j))}><Trash2 className="size-4"/></Button></div></div>)}<Button variant="outline" disabled={items.length>=20} onClick={()=>setItems(old=>[...old,{title:'',qty:1,price:0}])}><Plus className="size-4"/>Add item</Button><Button className="w-full" disabled={busy||!preview||preview.total<=0||items.some(i=>!i.title.trim())} onClick={async()=>{setBusy(true);try{await send$({data:{id,key:linkKey,items}});toast.success('Contract and invoice sent to client');onSent();}catch(e){toast.error(e instanceof Error?e.message:'Could not send invoice');}finally{setBusy(false);}}}>{busy?'Sending…':'Approve & send contract and invoice'}</Button></section><section className="min-w-0"><h2 className="mb-4 font-semibold">Live invoice preview</h2>{preview?<InvoiceCard inv={preview}/>:<p className="text-muted-foreground">No items yet</p>}</section></div>;
}
