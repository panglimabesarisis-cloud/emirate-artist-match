import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Eye, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendInvoice } from "@/lib/chat.functions";
import { buildInvoice, decodeInvoice, invoiceMoney as aed, type InvoiceItem, type Invoice } from "@/lib/invoice";
import { maskContacts } from "@/lib/masking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { InvoiceCard } from "@/components/site/InvoiceCard";
import { InvoiceLivePreview } from "@/components/dashboard/InvoiceLivePreview";
import { useI18n } from "@/lib/i18n";

export function InvoicesTab({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const send$ = useServerFn(sendInvoice);
  const { data } = useQuery({
    queryKey: ["invoices", artistId], refetchInterval: 5000,
    queryFn: async () => {
      const [c, r] = await Promise.all([
        supabase.from("conversations").select("id, quote_requests(name, event_date)").eq("artist_id", artistId).not("quote_request_id", "is", null).order("last_message_at", { ascending: false }).limit(100),
        supabase.from("rate_cards").select("id, title, price").eq("artist_id", artistId).order("sort"),
      ]);
      const convos = c.data ?? [];
      const ids = convos.map((x) => x.id);
      const stored = (await supabase.from("service_invoices").select("*").eq("artist_id", artistId).order("created_at", { ascending: false })).data ?? [];
      const m = ids.length ? (await supabase.from("messages").select("id, conversation_id, body, created_at").in("conversation_id", ids).like("body", "[[INVOICE]]%").order("created_at", { ascending: false })).data ?? [] : [];
      return { convos, rates: r.data ?? [], sent: m, stored };
    },
  });
  const [convo, setConvo] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const draft = (() => {
    try { return buildInvoice("PREVIEW", items.map(i => ({ ...i, title: maskContacts(i.title) })), null, null); }
    catch { return null; }
  })();
  const nameOf = (id: string) => data?.convos.find((c) => c.id === id)?.quote_requests?.name ?? "Client";
  const selectedClient = data?.convos.find((c) => c.id === convo)?.quote_requests;

  const submit = async () => {
    if (!convo) { toast.error("Choose a client chat"); return; }
    setBusy(true);
    try {
      const r = await send$({ data: { conversationId: convo, items, due: null, notes: "" } });
      toast.success(`Invoice ${r.no} sent to the chat`);
      setItems([]);
      qc.invalidateQueries({ queryKey: ["invoices", artistId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not send"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-6">
        <h2 className="mb-5 text-lg font-semibold">{t("New invoice")}</h2>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label={t("Invoice items")} className="min-w-0 space-y-5">
          <div className="space-y-2"><Label>{t("Client chat")}</Label>
            <Select value={convo} onValueChange={setConvo}><SelectTrigger><SelectValue placeholder="Choose a client" /></SelectTrigger>
              <SelectContent>{data?.convos.map((c) => <SelectItem key={c.id} value={c.id}>{c.quote_requests?.name ?? "Client"} · {c.quote_requests?.event_date ?? "date TBC"}</SelectItem>)}</SelectContent></Select>
          </div>
        <div>
          <Label>{t("Services")}</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {data?.rates.map((r) => <Button key={r.id} size="sm" variant="outline" className="h-auto max-w-full whitespace-normal py-2 text-start" onClick={() => setItems([...items, { title: r.title, qty: 1, price: Number(r.price) }])}><Plus className="me-1 h-3 w-3 shrink-0" />{r.title} · {aed(Number(r.price))}</Button>)}
            <Button size="sm" variant="outline" onClick={() => setItems([...items, { title: "", qty: 1, price: 0 }])}><Plus className="me-1 h-3 w-3" />{t("Custom item")}</Button>
          </div>
          <div className="mt-3 space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem] gap-2 border-b py-3 xl:grid-cols-[minmax(0,1fr)_4rem_7rem_2.5rem]">
                <div className="col-span-3 min-w-0 space-y-1 xl:col-span-1"><Label htmlFor={`invoice-item-${i}`} className="text-xs text-muted-foreground">{t("Item")}</Label><Input id={`invoice-item-${i}`} placeholder={t("Service")} value={it.title} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} /></div>
                <div className="min-w-0 space-y-1"><Label htmlFor={`invoice-qty-${i}`} className="text-xs text-muted-foreground">{t("Qty")}</Label><Input id={`invoice-qty-${i}`} type="number" min={1} value={it.qty} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} /></div>
                <div className="min-w-0 space-y-1"><Label htmlFor={`invoice-price-${i}`} className="text-xs text-muted-foreground">{t("Price (AED)")}</Label><Input id={`invoice-price-${i}`} type="number" min={0} step="0.01" value={it.price} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} /></div>
                <Button size="icon" variant="ghost" className="self-end" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`${t("Remove item")} ${i + 1}`}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t pt-4">
          <Button disabled={busy || !draft || !convo} onClick={submit} className="h-auto w-full whitespace-normal bg-gradient-gold py-3 text-gold-foreground"><Send className="me-2 h-4 w-4 shrink-0" />{t(busy ? "Sending…" : "Create & send to chat")}</Button>
        </div>
        </section>
        <InvoiceLivePreview invoice={draft} client={selectedClient?.name ?? t("Client")} eventDate={selectedClient?.event_date} />
        </div>
      </div>
      <div>
        <h2 className="text-lg font-semibold">Sent invoices</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead className="border-b bg-muted"><tr>{["Invoice", "Client", "Total", "Payment", "Paid at", "View"].map(h => <th key={h} className="p-3 text-start">{h}</th>)}</tr></thead><tbody>{data?.stored.map(r => <tr key={r.id} className="border-b"><td className="p-3 whitespace-nowrap">{r.number}</td><td className="p-3">{nameOf(r.conversation_id)}</td><td className="p-3 whitespace-nowrap">{aed(Number(r.total))}</td><td className="p-3"><Badge variant={r.status === "paid" ? "default" : "secondary"}>{r.status === "paid" ? "Paid" : "Unpaid"}</Badge></td><td className="p-3">{r.paid_at ? new Date(r.paid_at).toLocaleString("en-GB") : "—"}</td><td className="p-3"><Button variant="ghost" size="icon" aria-label={`View ${r.number}`} onClick={() => setPreview(r.document as unknown as Invoice)}><Eye className="h-4 w-4" /></Button></td></tr>)}{data?.stored.length === 0 && <tr><td colSpan={6} className="p-6">No invoices yet.</td></tr>}</tbody></table></div>
        {data?.sent.filter(m => !decodeInvoice(m.body)?.id).map(m => { const inv = decodeInvoice(m.body); return inv && <div key={m.id} className="mt-3"><p className="text-xs text-muted-foreground">Legacy invoice · payment status not tracked</p><InvoiceCard inv={inv} /></div>; })}
      </div>
      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Invoice preview</DialogTitle></DialogHeader>{preview && <InvoiceCard inv={preview} />}</DialogContent></Dialog>
    </div>
  );
}
