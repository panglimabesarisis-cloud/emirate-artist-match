import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendInvoice } from "@/lib/chat.functions";
import { buildInvoice, decodeInvoice, invoiceMoney as aed, type InvoiceItem, type Invoice } from "@/lib/invoice";
import { maskContacts } from "@/lib/masking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InvoiceCard } from "@/components/site/InvoiceCard";
import { InvoiceRecords, toInvoiceRows, useInvoiceQuery } from "@/components/dashboard/InvoiceRecords";
import { InvoiceLivePreview } from "@/components/dashboard/InvoiceLivePreview";
import { useI18n } from "@/lib/i18n";
import { StudioHeading, StudioSection, StudioSoon, StudioDonut } from "./StudioPage";

export function InvoicesTab({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const send$ = useServerFn(sendInvoice);
  const { data } = useQuery({
    queryKey: ["invoices", artistId], refetchInterval: 5000,
    queryFn: async () => {
      const [c, r] = await Promise.all([
        supabase.from("conversations").select("id, quote_requests(name, email, event_date)").eq("artist_id", artistId).order("last_message_at", { ascending: false }).limit(100),
        supabase.from("rate_cards").select("id, title, price").eq("artist_id", artistId).order("sort"),
      ]);
      if (c.error) throw c.error;
      const convos = c.data ?? [];
      const ids = convos.map((x) => x.id);
      const stored = (await supabase.from("service_invoices").select("*").eq("artist_id", artistId).is("deleted_at", null).order("created_at", { ascending: false })).data ?? [];
      const m = ids.length ? (await supabase.from("messages").select("id, conversation_id, body, created_at").in("conversation_id", ids).like("body", "[[INVOICE]]%").order("created_at", { ascending: false })).data ?? [] : [];
      return { convos, rates: r.data ?? [], sent: m, stored };
    },
  });
  const [convo, setConvo] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const me = useQuery({ queryKey: ["invoice-artist", artistId], queryFn: async () => (await supabase.from("artists").select("stage_name, trn").eq("id", artistId).maybeSingle()).data });
  const invQ = useInvoiceQuery(artistId);
  const invRows = toInvoiceRows(invQ.data ?? []);
  const outstanding = invRows.reduce((n, r) => n + Math.max(0, Number(r.total) - r.paid), 0);
  const collected = invRows.reduce((n, r) => n + r.paid, 0);
  const paidCount = invRows.filter((r) => r.status === "paid").length;
  const partialCount = invRows.filter((r) => r.status !== "paid" && r.paid > 0).length;
  const unpaidCount = invRows.length - paidCount - partialCount;
  const today = new Date().toISOString().slice(0, 10);
  const draft = (() => {
    try { return buildInvoice("PREVIEW", items.map(i => ({ ...i, title: maskContacts(i.title) })), due || null, notes.trim() || null); }
    catch { return null; }
  })();
  const nameOf = (id: string) => data?.convos.find((c) => c.id === id)?.quote_requests?.name ?? `Direct chat · ${id.slice(0, 8)}`;
  const selectedClient = data?.convos.find((c) => c.id === convo)?.quote_requests;

  const submit = async () => {
    if (!convo) { toast.error(t("Choose a client chat")); return; }
    setBusy(true);
    try {
      const r = await send$({ data: { conversationId: convo, items, due: due || null, notes: notes.trim() } });
      toast.success(`Invoice ${r.no} sent to the chat`);
      setItems([]); setDue(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["invoices", artistId] });
      qc.invalidateQueries({ queryKey: ["invoice-records", artistId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not send"); }
    finally { setBusy(false); }
  };

  return (
    <div className="dmr-wrap dmr-ipage">
      <StudioHeading title="Invo" accent="ice"><div className="dmr-q-stats">
        <div className="dmr-qs"><small>{t("Outstanding")}</small><b dir="ltr">{aed(outstanding)}</b></div>
        <div className="dmr-qs"><small>{t("Invoices sent")}</small><b>{invRows.length}</b></div>
        <div className="dmr-qs"><small>{t("Paid")}</small><b>{paidCount}</b></div>
      </div></StudioHeading>
      <StudioDonut title={t("Payment status")} subtitle="Invoices by payment" unit="invoices" entries={[{ label: "Unpaid", value: unpaidCount }, { label: "Partial", value: partialCount }, { label: "Paid", value: paidCount }]} />
      <StudioDonut title={t("Collected vs due")} subtitle="Amounts across all invoices, AED" unit="AED total" center={((n: number) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n))))(collected + outstanding)} format={aed} entries={[{ label: "Collected", value: collected }, { label: "Balance due", value: outstanding }]} />
      <section className="dmr-panel dmr-c-12 grid gap-7 !p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" aria-labelledby="in-h">
        <div className="flex min-w-0 flex-col gap-3.5">
          <h2 id="in-h" className="font-display text-[32px] leading-none">{t("New")} <span className="it">{t("invoice")}</span></h2>
          <div className="space-y-2"><Label htmlFor="inv-client">{t("Client chat")}</Label>
            <Select value={convo} onValueChange={setConvo}><SelectTrigger id="inv-client"><SelectValue placeholder={t("Choose a client")} /></SelectTrigger>
              <SelectContent>{data?.convos.map((c) => <SelectItem key={c.id} value={c.id}>{nameOf(c.id)} · {c.quote_requests?.event_date ?? "date TBC"}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="inv-issue">{t("Issue date")}</Label><Input id="inv-issue" type="date" value={today} disabled aria-describedby="inv-issue-note" /></div>
            <div className="space-y-2"><Label htmlFor="inv-due">{t("Due date")}</Label><Input id="inv-due" type="date" min={today} value={due} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
          <p id="inv-issue-note" className="-mt-2 text-[11px] text-muted-foreground">{t("Issue date is set to the day you send it.")} {t("An unpaid invoice is removed automatically once its due date has passed (hidden first, deleted permanently after 90 days).")}</p>
          <div className="flex flex-col gap-2.5 rounded-2xl border border-border p-3.5">
            <div className="flex items-center justify-between"><span className="text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{t("Services")}</span>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setItems([...items, { title: "", qty: 1, price: 0 }])}><Plus className="me-1 h-3.5 w-3.5" />{t("Custom item")}</Button></div>
            {(data?.rates.length ?? 0) > 0 && (
              <div className="flex flex-col gap-1.5 text-[11.5px] text-muted-foreground"><span>{t("From your ratecard:")}</span>
                <div className="flex flex-wrap gap-1.5">{data?.rates.map((r) => <button key={r.id} type="button" onClick={() => setItems([...items, { title: r.title, qty: 1, price: Number(r.price) }])} className="rounded-full border border-dashed border-gold/45 px-2.5 py-1.5 text-xs font-bold text-gold transition-colors hover:bg-gold/10">+ {r.title} · {aed(Number(r.price))}</button>)}</div>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_64px_110px_34px] items-end gap-2">
                  <div className="min-w-0 space-y-1"><Label htmlFor={`invoice-item-${i}`} className={`text-[10px] ${i > 0 ? "sr-only" : ""}`}>{t("Item")}</Label><Input id={`invoice-item-${i}`} placeholder={t("Service")} value={it.title} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} /></div>
                  <div className="min-w-0 space-y-1"><Label htmlFor={`invoice-qty-${i}`} className={`text-[10px] ${i > 0 ? "sr-only" : ""}`}>{t("Qty")}</Label><Input id={`invoice-qty-${i}`} type="number" min={1} value={it.qty} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} /></div>
                  <div className="min-w-0 space-y-1"><Label htmlFor={`invoice-price-${i}`} className={`text-[10px] ${i > 0 ? "sr-only" : ""}`}>{t("Price (AED)")}</Label><Input id={`invoice-price-${i}`} type="number" min={0} step="0.01" value={it.price} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} /></div>
                  <Button size="icon" variant="outline" className="h-10 w-[34px]" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`${t("Remove item")} ${i + 1}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            {items.length === 0 && <p className="text-[12.5px] text-muted-foreground/70">{t("No items yet. Add a custom item or pick one from your ratecard.")}</p>}
          </div>
          <div className="space-y-2"><Label htmlFor="inv-notes">{t("Notes (optional)")}</Label><Textarea id="inv-notes" rows={3} maxLength={500} placeholder={t("Event details, rehearsal, wardrobe")} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <Button disabled={busy || !draft || !convo} onClick={submit} className="h-auto w-full whitespace-normal rounded-full bg-gradient-gold py-3 font-bold text-gold-foreground"><Send className="me-2 h-4 w-4 shrink-0" />{t(busy ? "Sending…" : "Create & send to chat")}</Button>
        </div>
        <InvoiceLivePreview invoice={draft} client={selectedClient?.name ?? null} clientEmail={selectedClient?.email} eventDate={selectedClient?.event_date} artistName={me.data?.stage_name ?? ""} issued={today} due={due || null} trn={me.data?.trn} />
      </section>
      <div className="dmr-panel dmr-q-panel dmr-c-12">
        <InvoiceRecords artistId={artistId} />
        {data?.sent.filter(m => !decodeInvoice(m.body)?.id).map(m => { const inv = decodeInvoice(m.body); return inv && <div key={m.id} className="mt-3"><p className="text-xs text-muted-foreground">{t("Legacy invoice · payment status not tracked")}</p><InvoiceCard inv={inv} /></div>; })}
      </div>
      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{t("Invoice preview")}</DialogTitle></DialogHeader>{preview && <InvoiceCard inv={preview} />}</DialogContent></Dialog>
    </div>
  );
}
