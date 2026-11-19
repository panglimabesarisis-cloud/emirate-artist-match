import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendInvoice } from "@/lib/chat.functions";
import { decodeInvoice, type InvoiceItem } from "@/lib/invoice";
import { priceBreakdown } from "@/lib/booking-rules";
import { aed } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InvoiceCard } from "@/components/site/InvoiceCard";

export function InvoicesTab({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const send$ = useServerFn(sendInvoice);
  const { data } = useQuery({
    queryKey: ["invoices", artistId],
    queryFn: async () => {
      const [c, r] = await Promise.all([
        supabase.from("conversations").select("id, quote_requests(name, event_date)").eq("artist_id", artistId).not("quote_request_id", "is", null).order("last_message_at", { ascending: false }).limit(100),
        supabase.from("rate_cards").select("id, title, price").eq("artist_id", artistId).order("sort"),
      ]);
      const convos = c.data ?? [];
      const ids = convos.map((x) => x.id);
      const m = ids.length ? (await supabase.from("messages").select("id, conversation_id, body, created_at").in("conversation_id", ids).like("body", "[[INVOICE]]%").order("created_at", { ascending: false })).data ?? [] : [];
      return { convos, rates: r.data ?? [], sent: m };
    },
  });
  const [convo, setConvo] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const p = priceBreakdown(items.reduce((s, i) => s + i.qty * i.price, 0));
  const nameOf = (id: string) => data?.convos.find((c) => c.id === id)?.quote_requests?.name ?? "Client";

  const submit = async () => {
    if (!convo) { toast.error("Choose a client chat"); return; }
    setBusy(true);
    try {
      const r = await send$({ data: { conversationId: convo, items, due: due || null, notes } });
      toast.success(`Invoice ${r.no} sent to the chat`);
      setItems([]); setNotes(""); setDue("");
      qc.invalidateQueries({ queryKey: ["invoices", artistId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not send"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="text-lg font-semibold">New invoice</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Client chat</Label>
            <Select value={convo} onValueChange={setConvo}><SelectTrigger><SelectValue placeholder="Choose a client" /></SelectTrigger>
              <SelectContent>{data?.convos.map((c) => <SelectItem key={c.id} value={c.id}>{c.quote_requests?.name ?? "Client"} · {c.quote_requests?.event_date ?? "date TBC"}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label>Due date</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        </div>
        <div>
          <Label>Services</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {data?.rates.map((r) => <Button key={r.id} size="sm" variant="outline" onClick={() => setItems([...items, { title: r.title, qty: 1, price: Number(r.price) }])}><Plus className="me-1 h-3 w-3" />{r.title} · {aed(Number(r.price))}</Button>)}
            <Button size="sm" variant="ghost" onClick={() => setItems([...items, { title: "", qty: 1, price: 0 }])}><Plus className="me-1 h-3 w-3" />Custom item</Button>
          </div>
          <div className="mt-3 space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <Input className="flex-1" placeholder="Service" value={it.title} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                <Input className="w-20" type="number" min={1} value={it.qty} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} />
                <Input className="w-32" type="number" min={0} value={it.price} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} />
                <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </div>
        <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, details…" /></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="text-sm text-muted-foreground">Subtotal {aed(p.subtotal)} · VAT 5% {aed(p.vat)} · <span className="font-semibold text-foreground">Total {aed(p.total)}</span></div>
          <Button disabled={busy || items.length === 0} onClick={submit} className="bg-gradient-gold text-gold-foreground">Create & send to chat</Button>
        </div>
      </div>
      <div>
        <h2 className="text-lg font-semibold">Sent invoices</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {data?.sent.length === 0 && <p className="text-sm text-muted-foreground">No invoices yet.</p>}
          {data?.sent.map((m) => { const inv = decodeInvoice(m.body); return inv && <div key={m.id}><div className="mb-1 text-xs text-muted-foreground">{nameOf(m.conversation_id)} · {m.created_at.slice(0, 10)}</div><InvoiceCard inv={inv} /></div>; })}
        </div>
      </div>
    </div>
  );
}
