import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { createBookingOffer, completeBooking, cancelBookingAsArtist, openDisputeAsArtist } from "@/lib/bookings.functions";
import { canComplete, canDispute, priceBreakdown } from "@/lib/booking-rules";
import { aed } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function BookingsTab({ artistId, trn, notifyPhone, teamMode = false }: { artistId: string; trn: string | null; notifyPhone: string | null; teamMode?: boolean }) {
  const qc = useQueryClient();
  const offer$ = useServerFn(createBookingOffer);
  const complete$ = useServerFn(completeBooking);
  const cancel$ = useServerFn(cancelBookingAsArtist);
  const dispute$ = useServerFn(openDisputeAsArtist);
  const [phone, setPhone] = useState(notifyPhone ?? "");
  const key = ["artist-bookings", artistId];
  const { data: bookings } = useQuery({ queryKey: key, queryFn: async () => (await supabase.from("bookings").select("id, client_name, client_email, package_title, event_date, amount, total, status, escrow_status, invoice_no, refund_amount, is_seed, artist_key, drafted_by").eq("artist_id", artistId).eq("is_seed", false).order("created_at", { ascending: false })).data ?? [] });
  const { data: convs } = useQuery({ queryKey: ["offer-convs", artistId], queryFn: async () => (await supabase.from("conversations").select("id, quote_requests(name, event_date)").eq("artist_id", artistId).order("last_message_at", { ascending: false }).limit(50)).data ?? [] });
  const { data: packages } = useQuery({ queryKey: ["offer-packages", artistId], queryFn: async () => (await supabase.from("rate_cards").select("id, title, price").eq("artist_id", artistId).order("sort")).data ?? [] });
  const emails = [...new Set((bookings ?? []).map((b) => b.client_email?.toLowerCase()).filter(Boolean))] as string[];
  const { data: ratings } = useQuery({ queryKey: ["client-ratings", artistId, emails.join(",")], enabled: emails.length > 0, queryFn: async () => (await supabase.from("client_ratings").select("booking_id, client_email, rating, note, artist_id").in("client_email", emails)).data ?? [] });
  const [rate, setRate] = useState<{ id: string; rating: number; note: string } | null>(null);
  const rep = (email: string | null) => { const r = (ratings ?? []).filter((x) => x.client_email.toLowerCase() === email?.toLowerCase()); return r.length ? { avg: r.reduce((n, x) => n + x.rating, 0) / r.length, n: r.length, notes: r.filter((x) => x.note).map((x) => x.note!) } : null; };
  const saveRating = async (b: { id: string; client_email: string | null }) => {
    if (!rate || !b.client_email) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("client_ratings").insert({ booking_id: b.id, artist_id: artistId, client_email: b.client_email.toLowerCase(), rating: rate.rating, note: rate.note.trim().slice(0, 500) || null, created_by: u.user!.id });
    if (error) { toast.error("Could not save rating"); return; }
    toast.success("Private client rating saved"); setRate(null); qc.invalidateQueries({ queryKey: ["client-ratings"] });
  };
  const [f, setF] = useState({ conversationId: "", title: "", amount: "", eventDate: "", notes: "" });
  const [trnV, setTrn] = useState(trn ?? "");
  const [busy, setBusy] = useState(false);
  const p = priceBreakdown(Number(f.amount) || 0);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); qc.invalidateQueries({ queryKey: key }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {bookings?.length === 0 && <p className="text-muted-foreground">No platform bookings yet. Send an offer from a quote conversation.</p>}
        {bookings?.map((b) => (
          <div key={b.id} className="rounded-xl bg-card p-4 shadow-card">
            <div className="flex justify-between gap-3">
              <div>
                <div className="font-semibold">{b.client_name} · {b.package_title}</div>
                <div className="text-sm text-muted-foreground">{b.event_date} · {aed(Number(b.total))} incl. VAT {b.invoice_no ? `· ${b.invoice_no}` : ""}</div>
                {(() => { const r = rep(b.client_email); return r ? <div className="text-xs" title={r.notes.join(" · ")}>Client reputation (private): <b>{r.avg.toFixed(1)}★</b> from {r.n} booking{r.n > 1 ? "s" : ""}{r.notes.length ? ` · “${r.notes[0]}”` : ""}</div> : null; })()}
                <div className="text-xs text-muted-foreground">Escrow: {b.escrow_status}{Number(b.refund_amount) > 0 ? ` · refunded ${aed(Number(b.refund_amount))}` : ""}</div>
              </div>
              <Badge variant={b.status === "confirmed" || b.status === "inquiry" ? "default" : "secondary"}>{b.status === "quoted" ? "offer sent" : b.status === "inquiry" ? "needs your approval" : b.status}</Badge>
            </div>
            {b.status === "completed" && b.client_email && !(ratings ?? []).some((x) => x.booking_id === b.id) && (
              rate?.id === b.id ? (
                <div className="mt-3 space-y-2 rounded-lg border p-3">
                  <div className="text-xs font-semibold">Rate this client privately (only artists see this)</div>
                  <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} stars`} className={n <= rate.rating ? "text-gold" : "text-muted-foreground"} onClick={() => setRate({ ...rate, rating: n })}>★</button>)}</div>
                  <Input placeholder="Private note (optional)" maxLength={500} value={rate.note} onChange={(e) => setRate({ ...rate, note: e.target.value })} />
                  <div className="flex gap-2"><Button size="sm" onClick={() => saveRating(b)}>Save rating</Button><Button size="sm" variant="ghost" onClick={() => setRate(null)}>Cancel</Button></div>
                </div>
              ) : <Button size="sm" variant="outline" className="mt-3" onClick={() => setRate({ id: b.id, rating: 5, note: "" })}>Rate client</Button>
            )}
            {b.status === "inquiry" && (
              <Button asChild size="sm" className="mt-3 bg-gradient-gold text-gold-foreground"><Link to="/approve/$id" params={{ id: b.id }} search={{ k: b.artist_key }}>Review & approve</Link></Button>
            )}
            {(b.status === "quoted" || b.status === "confirmed") && (
              <div className="mt-3 flex flex-wrap gap-2">
                {b.status === "confirmed" && <Button size="sm" disabled={busy || !canComplete(b.status, b.event_date)} title={canComplete(b.status, b.event_date) ? "" : "Available from the event date"} onClick={() => run(() => complete$({ data: { id: b.id } }), "Marked completed — escrow released")}>Mark completed</Button>}
                {canDispute(b.status, b.escrow_status) && <Button size="sm" variant="outline" disabled={busy} onClick={() => { const r = prompt("Describe the problem for the Dealmaker team"); if (r) run(() => dispute$({ data: { id: b.id, reason: r } }), "Dispute opened"); }}>Report problem</Button>}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm("Cancel? The client gets a full refund.")) run(() => cancel$({ data: { id: b.id } }), "Booking cancelled"); }}>Cancel</Button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="space-y-6">
        <div className="rounded-xl bg-card p-4 shadow-card space-y-3">
          <h3 className="font-semibold">Send booking offer</h3>
          <div><Label>Conversation</Label>
            <Select value={f.conversationId} onValueChange={(v) => { const c = convs?.find((x) => x.id === v); setF({ ...f, conversationId: v, eventDate: c?.quote_requests?.event_date ?? f.eventDate }); }}>
              <SelectTrigger><SelectValue placeholder="Choose client" /></SelectTrigger>
              <SelectContent>{convs?.map((c) => <SelectItem key={c.id} value={c.id}>{c.quote_requests?.name ?? "Client"}{c.quote_requests?.event_date ? ` · ${c.quote_requests.event_date}` : ""}</SelectItem>)}</SelectContent>
            </Select></div>
          {packages && packages.length > 0 && <div><Label>From package</Label>
            <Select onValueChange={(v) => { const pk = packages.find((x) => x.id === v); if (pk) setF({ ...f, title: pk.title, amount: String(pk.price) }); }}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>{packages.map((pk) => <SelectItem key={pk.id} value={pk.id}>{pk.title} · {aed(Number(pk.price))}</SelectItem>)}</SelectContent>
            </Select></div>}
          <div><Label>Title</Label><Input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Price excl. VAT</Label><Input type="number" min={1} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div><Label>Event date</Label><Input type="date" value={f.eventDate} onChange={(e) => setF({ ...f, eventDate: e.target.value })} /></div>
          </div>
          <div><Label>Notes</Label><Textarea rows={2} maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground">VAT 5%: {aed(p.vat)} · Client pays {aed(p.total)}</p>
          <Button className="w-full" disabled={busy || !f.conversationId || !f.eventDate || !(Number(f.amount) > 0)}
            onClick={() => run(async () => { await offer$({ data: { ...f, amount: Number(f.amount) } }); setF({ conversationId: "", title: "", amount: "", eventDate: "", notes: "" }); }, "Offer sent to the client's chat")}>Send offer</Button>
        </div>
        {!teamMode && <><div className="rounded-xl bg-card p-4 shadow-card space-y-2">
          <h3 className="font-semibold">Booking alerts</h3>
          <Label>WhatsApp number for approval requests</Label>
          <div className="flex gap-2"><Input value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))} placeholder="+971 50 123 4567" />
            <Button variant="outline" onClick={async () => { const { error } = await supabase.from("artists").update({ notify_phone: phone || null }).eq("id", artistId); if (error) toast.error(error.message); else toast.success("Saved"); }}>Save</Button></div>
          <p className="text-xs text-muted-foreground">Approval requests also go to your account email.</p>
        </div>
        <div className="rounded-xl bg-card p-4 shadow-card space-y-2">
          <h3 className="font-semibold">VAT registration</h3>
          <Label>TRN (shown on invoices)</Label>
          <div className="flex gap-2"><Input value={trnV} maxLength={15} onChange={(e) => setTrn(e.target.value.replace(/\D/g, ""))} placeholder="15 digits" />
            <Button variant="outline" onClick={async () => { const { error } = await supabase.from("artists").update({ trn: trnV || null }).eq("id", artistId); if (error) toast.error(error.message); else toast.success("TRN saved"); }}>Save</Button></div>
        </div></>}
      </div>
    </div>
  );
}
