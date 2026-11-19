import type { Invoice } from "@/lib/invoice";
import { aed } from "@/lib/format";

export function InvoiceCard({ inv }: { inv: Invoice }) {
  return (
    <div className="rounded-xl border border-gold/40 bg-card p-4 text-sm shadow-card">
      <div className="flex justify-between gap-2"><div className="font-semibold">Invoice {inv.no}</div>{inv.due && <div className="text-xs text-muted-foreground">Due {inv.due}</div>}</div>
      <div className="mt-2 space-y-1">{inv.items.map((i, k) => <div key={k} className="flex justify-between gap-2"><span>{i.qty} × {i.title}</span><span>{aed(i.qty * i.price)}</span></div>)}</div>
      <div className="mt-2 space-y-0.5 border-t pt-2 text-muted-foreground"><div className="flex justify-between"><span>Subtotal</span><span>{aed(inv.subtotal)}</span></div><div className="flex justify-between"><span>VAT 5%</span><span>{aed(inv.vat)}</span></div></div>
      <div className="mt-1 flex justify-between font-semibold"><span>Total</span><span>{aed(inv.total)}</span></div>
      {inv.notes && <div className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{inv.notes}</div>}
    </div>
  );
}
