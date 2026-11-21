import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { StudioHeading, StudioSoon } from "./StudioPage";
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
import { bookingPayment } from "@/lib/booking-payment-rules";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function BookingsTab({ artistId, trn, notifyPhone, teamMode = false }: { artistId: string; trn: string | null; notifyPhone: string | null; teamMode?: boolean }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const qc = useQueryClient();
  const offer$ = useServerFn(createBookingOffer);
  const complete$ = useServerFn(completeBooking);
  const cancel$ = useServerFn(cancelBookingAsArtist);
  const dispute$ = useServerFn(openDisputeAsArtist);
  const [phone, setPhone] = useState(notifyPhone ?? "");
  const key = ["artist-bookings", artistId];
  const { data: bookings } = useQuery({ queryKey: key, queryFn: async () => (await supabase.from("bookings").select("start_time,end_time,job_detail,notes,paid_amount,deposit_pct,calendar_sync_status,calendar_sync_error,reminder_sent_at,id, client_name, client_email, package_title, event_date, amount, total, status, escrow_status, invoice_no, refund_amount, is_seed, artist_key, drafted_by").eq("artist_id", artistId).eq("is_seed", false).order("created_at", { ascending: false })).data ?? [] });
  const { data: convs } = useQuery({ queryKey: ["offer-convs", artistId], queryFn: async () => (await supabase.from("conversations").select("id, quote_requests(name, event_date)").eq("artist_id", artistId).order("last_message_at", { ascending: false }).limit(50)).data ?? [] });
  const { data: packages } = useQuery({ queryKey: ["offer-packages", artistId], queryFn: async () => (await supabase.from("rate_cards").select("id, title, price").eq("artist_id", artistId).order("sort")).data ?? [] });
  const emails = [...new Set((bookings ?? []).map((b) => b.client_email?.toLowerCase()).filter(Boolean))] as string[];
  const { data: ratings } = useQuery({ queryKey: ["client-ratings", artistId, emails.join(",")], enabled: emails.length > 0, queryFn: async () => (await supabase.from("client_ratings").select("booking_id, client_email, rating, note, artist_id").in("client_email", emails)).data ?? [] });
  const [rate, setRate] = useState<{ id: string; rating: number; note: string } | null>(null);
  const rep = (email: string | null) => { const r = (ratings ?? []).filter((x) => x.client_email.toLowerCase() === email?.toLowerCase()); return r.length ? { avg: r.reduce((n, x) => n + x.rating, 0) / r.length, n: r.length, notes: r.filter((x) => x.note).map((x) => x.note ?? "") } : null; };
  const saveRating = async (b: { id: string; client_email: string | null }) => {
    if (!rate || !b.client_email) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Please sign in"); return; }
    const { error } = await supabase.from("client_ratings").insert({ booking_id: b.id, artist_id: artistId, client_email: b.client_email.toLowerCase(), rating: rate.rating, note: rate.note.trim().slice(0, 500) || null, created_by: u.user.id });
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
    <div className="dmr-wrap dmr-bpage">
      <StudioHeading title="Book" accent="ings"><div className="dmr-q-stats">{["inquiry","confirmed","completed"].map(status=><div className="dmr-qs" key={status}><small>{t(status)}</small><b>{bookings?.filter(b=>b.status === status).length ?? 0}</b></div>)}</div></StudioHeading>
      <section className="dmr-panel dmr-q-panel dmr-b-main"><div className="dmr-q-tools"><Input aria-label={t("Search bookings")} placeholder={t("Search client or booking")} value={search} onChange={e=>setSearch(e.target.value)} /><div className="dmr-q-tabs">{["all","inquiry","quoted","confirmed","completed"].map(status=><Button key={status} variant={filter === status ? "default" : "ghost"} aria-pressed={filter === status} onClick={()=>setFilter(status)}>{t(status === "all" ? "All" : status)}</Button>)}</div></div>
      <div className="min-w-0 overflow-x-auto"><table className="studio-bookings-table"><thead><tr className="border-b text-start"><th className="p-3 text-start">{t("Client / booking")}</th><th className="p-3 text-start">{t("Date & time")}</th><th className="p-3 text-start">{t("Total")}</th><th className="p-3 text-start">{t("Payment")}</th><th className="p-3 text-start">{t("Balance")}</th><th className="p-3 text-start">{t("Calendar")}</th></tr></thead><tbody>
        {bookings?.length === 0 && <tr><td colSpan={6} className="p-4 text-muted-foreground">{t("No bookings yet")}</td></tr>}
        {bookings?.filter(b=>(filter === "all" || b.status === filter) && `${b.client_name} ${b.package_title}`.toLowerCase().includes(search.toLowerCase())).map((b) => (
          <tr key={b.id} className="border-b align-top"><td className="min-w-[250px] p-3">
            <div className="flex justify-between gap-3">
              <div>
                <div className="font-semibold">{b.client_name} · {b.package_title}</div>
                <div className="text-sm text-muted-foreground">{b.event_date} · {aed(Number(b.total))} {t("incl. VAT")} {b.invoice_no ? `· ${b.invoice_no}` : ""}</div>
                {(() => { const r = rep(b.client_email); return r ? <div className="text-xs" title={r.notes.join(" · ")}>{t("Client reputation (private):")} <b>{r.avg.toFixed(1)}★</b> {t("from")} {r.n} {t("booking")}{r.n > 1 ? t("s") : ""}{r.notes.length ? ` · “${r.notes[0]}”` : ""}</div> : null; })()}
                <div className="text-xs text-muted-foreground">{t("Escrow:")} {b.escrow_status}{Number(b.refund_amount) > 0 ? ` · refunded ${aed(Number(b.refund_amount))}` : ""}</div>
              </div>
              <Badge variant={b.status === "confirmed" || b.status === "inquiry" ? "default" : "secondary"}>{b.status === "quoted" ? t("offer sent") : b.status === "inquiry" ? t("needs your approval") : b.status}</Badge>
            </div>
            {b.status === "completed" && b.client_email && !(ratings ?? []).some((x) => x.booking_id === b.id) && (
              rate?.id === b.id ? (
                <div className="mt-3 space-y-2 rounded-lg border p-3">
                  <div className="text-xs font-semibold">{t("Rate this client privately (only artists see this)")}</div>
                  <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <Button variant="ghost" size="icon" key={n} type="button" aria-label={`${n} stars`} className={n <= rate.rating ? "text-gold" : "text-muted-foreground"} onClick={() => setRate({ ...rate, rating: n })}>★</Button>)}</div>
                  <Input placeholder={t("Private note (optional)")} maxLength={500} value={rate.note} onChange={(e) => setRate({ ...rate, note: e.target.value })} />
                  <div className="flex gap-2"><Button size="sm" onClick={() => saveRating(b)}>{t("Save rating")}</Button><Button size="sm" variant="ghost" onClick={() => setRate(null)}>{t("Cancel")}</Button></div>
                </div>
              ) : <Button size="sm" variant="outline" className="mt-3" onClick={() => setRate({ id: b.id, rating: 5, note: "" })}>{t("Rate client")}</Button>
            )}
            {b.status === "inquiry" && (
              <Button asChild size="sm" className="mt-3 bg-gradient-gold text-gold-foreground"><Link to="/approve/$id" params={{ id: b.id }} search={{ k: b.artist_key }}>{t("Review & approve")}</Link></Button>
            )}
            {(b.status === "quoted" || b.status === "confirmed") && (
              <div className="mt-3 flex flex-wrap gap-2">
                {b.status === "confirmed" && <Button size="sm" disabled={busy || Number(b.paid_amount)<Number(b.total) || !canComplete(b.status, b.event_date)} title={canComplete(b.status, b.event_date) ? "" : t("Available from the event date")} onClick={() => run(() => complete$({ data: { id: b.id } }), "Marked completed — escrow released")}>{t("Mark completed")}</Button>}
                {canDispute(b.status, b.escrow_status) && <Button size="sm" variant="outline" disabled={busy} onClick={() => { const r = prompt("Describe the problem for the Dealmaker team"); if (r) run(() => dispute$({ data: { id: b.id, reason: r } }), "Dispute opened"); }}>{t("Report problem")}</Button>}
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm("Cancel? The client gets a full refund.")) run(() => cancel$({ data: { id: b.id } }), "Booking cancelled"); }}>{t("Cancel")}</Button>
              </div>
            )}
            <details className="mt-3"><summary className="cursor-pointer text-primary">{t("Booking information")}</summary><table className="mt-2 w-full text-xs"><tbody>{[["Job detail",b.job_detail??b.notes??"—"],["Email",b.client_email??"—"],["Invoice",b.invoice_no??"—"],["H-7 reminder",b.reminder_sent_at?"Sent":"Pending"],["Calendar error",b.calendar_sync_error??"—"]].map(([k,v])=><tr key={k} className="border-b"><th className="py-2 pe-2 text-start">{k}</th><td className="py-2 whitespace-pre-wrap break-words">{v}</td></tr>)}</tbody></table></details>
          </td><td className="p-3 whitespace-nowrap">{b.event_date}<div className="text-xs text-muted-foreground">{b.start_time?.slice(0,5)??"—"} – {b.end_time?.slice(0,5)??"—"}</div></td><td className="p-3 whitespace-nowrap">{aed(Number(b.total))}</td><td className="p-3 whitespace-nowrap"><Badge variant={Number(b.paid_amount)>0?"default":"secondary"}>{Number(b.paid_amount)>0?`Paid ${bookingPayment(Number(b.total),Number(b.paid_amount),b.deposit_pct).percent}%`:t("Unpaid")}</Badge></td><td className="p-3 whitespace-nowrap">{aed(bookingPayment(Number(b.total),Number(b.paid_amount),b.deposit_pct).balance)}</td><td className="p-3">{b.calendar_sync_status}</td></tr>
        ))}
      </tbody></table></div><div className="dmr-q-foot"><span>{bookings?.length ?? 0} {t("bookings")}</span><span>{t("All totals in AED, incl. 5% VAT")}</span></div></section>
      <aside className="dmr-b-side">
        <div className="dmr-panel dmr-b-card space-y-3">
          <h3 className="font-semibold">{t("Send booking offer")}</h3>
          <div><Label>{t("Conversation")}</Label>
            <Select value={f.conversationId} onValueChange={(v) => { const c = convs?.find((x) => x.id === v); setF({ ...f, conversationId: v, eventDate: c?.quote_requests?.event_date ?? f.eventDate }); }}>
              <SelectTrigger><SelectValue placeholder={t("Choose client")} /></SelectTrigger>
              <SelectContent>{convs?.map((c) => <SelectItem key={c.id} value={c.id}>{c.quote_requests?.name ?? "Client"}{c.quote_requests?.event_date ? ` · ${c.quote_requests.event_date}` : ""}</SelectItem>)}</SelectContent>
            </Select></div>
          {packages && packages.length > 0 && <div><Label>{t("From package")}</Label>
            <Select onValueChange={(v) => { const pk = packages.find((x) => x.id === v); if (pk) setF({ ...f, title: pk.title, amount: String(pk.price) }); }}>
              <SelectTrigger><SelectValue placeholder={t("Optional")} /></SelectTrigger>
              <SelectContent>{packages.map((pk) => <SelectItem key={pk.id} value={pk.id}>{pk.title} · {aed(Number(pk.price))}</SelectItem>)}</SelectContent>
            </Select></div>}
          <div><Label>{t("Title")}</Label><Input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>{t("Price excl. VAT")}</Label><Input type="number" min={1} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div><Label>{t("Event date")}</Label><Input type="date" value={f.eventDate} onChange={(e) => setF({ ...f, eventDate: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3"><StudioSoon label="Start time" /><StudioSoon label="End time" /></div>
          <div><Label>{t("Notes")}</Label><Textarea rows={2} maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          <div className="dmr-vat"><div><span>{t("Price")}</span><b>{aed(Number(f.amount) || 0)}</b></div><div><span>{t("VAT 5%")}</span><b>{aed(p.vat)}</b></div><div><span>{t("Client pays")}</span><b>{aed(p.total)}</b></div></div>
          <Button className="w-full" disabled={busy || !f.conversationId || !f.eventDate || !(Number(f.amount) > 0)}
            onClick={() => run(async () => { await offer$({ data: { ...f, amount: Number(f.amount) } }); setF({ conversationId: "", title: "", amount: "", eventDate: "", notes: "" }); }, "Offer sent to the client's chat")}>{t("Send offer")}</Button>
        </div>
        {!teamMode && <><div className="dmr-panel dmr-b-card space-y-2">
          <h3 className="font-semibold">{t("Booking alerts")}</h3>
          <Label>{t("WhatsApp number for approval requests")}</Label>
          <div className="flex gap-2"><Input value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))} placeholder="+971 50 123 4567" />
            <Button variant="outline" onClick={async () => { const { error } = await supabase.from("artists").update({ notify_phone: phone || null }).eq("id", artistId); if (error) toast.error(error.message); else toast.success("Saved"); }}>{t("Save")}</Button></div>
          <p className="text-xs text-muted-foreground">{t("Approval requests also go to your account email.")}</p>
        </div>
        <div className="dmr-panel dmr-b-card space-y-2">
          <h3 className="font-semibold">{t("VAT registration")}</h3>
          <Label>{t("TRN (shown on invoices)")}</Label>
          <div className="flex gap-2"><Input value={trnV} maxLength={15} onChange={(e) => setTrn(e.target.value.replace(/\D/g, ""))} placeholder={t("15 digits")} />
            <Button variant="outline" onClick={async () => { const { error } = await supabase.from("artists").update({ trn: trnV || null }).eq("id", artistId); if (error) toast.error(error.message); else toast.success("TRN saved"); }}>{t("Save")}</Button></div>
        </div></>}
      </aside>
    </div>
  );
}
