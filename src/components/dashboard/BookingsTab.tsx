import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { MoreVertical, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

const TABS: Array<[string, string]> = [["all", "All"], ["inquiry", "Needs approval"], ["quoted", "Offer sent"], ["confirmed", "Confirmed"], ["completed", "Completed"], ["cancelled", "Cancelled"]];
const STATUS_STYLE: Record<string, string> = {
  inquiry: "border-gold/50 bg-gold/15 text-gold", quoted: "border-border bg-foreground/[.06] text-foreground", confirmed: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  completed: "border-blue-400/40 bg-blue-400/10 text-blue-300", cancelled: "border-border text-muted-foreground",
};
const statusLabel = (s: string) => (s === "quoted" ? "offer sent" : s === "inquiry" ? "needs approval" : s);
const payState = (b: { total: number | string; paid_amount: number | string }) => (Number(b.paid_amount) >= Number(b.total) && Number(b.total) > 0 ? "paid" : Number(b.paid_amount) > 0 ? "partial" : "unpaid");
const bkHead = "whitespace-nowrap border-b border-border bg-card px-3.5 py-3 text-[11px] font-extrabold uppercase tracking-[.1em] text-muted-foreground";
const bkCell = "border-b border-border px-3.5 py-3.5 align-middle";

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
    if (!u.user) { toast.error(t("Please sign in")); return; }
    const { error } = await supabase.from("client_ratings").insert({ booking_id: b.id, artist_id: artistId, client_email: b.client_email.toLowerCase(), rating: rate.rating, note: rate.note.trim().slice(0, 500) || null, created_by: u.user.id });
    if (error) { toast.error(t("Could not save rating")); return; }
    toast.success(t("Private client rating saved")); setRate(null); qc.invalidateQueries({ queryKey: ["client-ratings"] });
  };
  const [f, setF] = useState({ conversationId: "", title: "", amount: "", eventDate: "", notes: "" });
  const [trnV, setTrn] = useState(trn ?? "");
  const [busy, setBusy] = useState(false);
  const p = priceBreakdown(Number(f.amount) || 0);

  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [info, setInfo] = useState<NonNullable<typeof bookings>[number] | null>(null);
  const counts = useMemo(() => {
    const list = bookings ?? [];
    const c: Record<string, number> = { all: list.length };
    for (const [k] of TABS) if (k !== "all") c[k] = list.filter((b) => b.status === k).length;
    return c as Record<string, number>;
  }, [bookings]);
  const outstanding = (bookings ?? []).filter((b) => b.status === "quoted" || b.status === "confirmed").reduce((n, b) => n + bookingPayment(Number(b.total), Number(b.paid_amount), b.deposit_pct).balance, 0);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (bookings ?? []).filter((b) => (filter === "all" || b.status === filter) && (!needle || `${b.client_name} ${b.package_title} ${b.invoice_no ?? ""}`.toLowerCase().includes(needle)));
  }, [bookings, filter, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const cur = Math.min(page, pages - 1);
  const pageRows = filtered.slice(cur * size, cur * size + size);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(t(ok)); qc.invalidateQueries({ queryKey: key }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="dmr-wrap dmr-bpage">
      <StudioHeading title="Book" accent="ings"><div className="dmr-q-stats">
        <div className="dmr-qs"><small>{t("Needs approval")}</small><b>{counts["inquiry"] ?? 0}</b></div>
        <div className="dmr-qs"><small>{t("Offers sent")}</small><b>{counts["quoted"] ?? 0}</b></div>
        <div className="dmr-qs"><small>{t("Outstanding")}</small><b dir="ltr">{aed(outstanding)}</b></div>
      </div></StudioHeading>
      <section className="dmr-panel dmr-q-panel dmr-b-main" aria-label={t("Bookings table")}>
        <div className="dmr-q-tools">
          <label className="relative flex max-w-md flex-1 basis-64 items-center">
            <Search className="pointer-events-none absolute start-3.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">{t("Search bookings")}</span>
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder={t("Search client or booking")} className="h-10 w-full rounded-full border border-border bg-foreground/[.04] pe-4 ps-10 text-sm outline-none focus-visible:border-gold" />
          </label>
          <div className="flex flex-wrap gap-0.5 rounded-xl bg-foreground/[.04] p-[3px]" role="group" aria-label={t("Filter by status")}>
            {TABS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setPage(0); }} className={`rounded-[10px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${filter === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{t(label)} <span className="opacity-60">{counts[k]}</span></button>
            ))}
          </div>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-[13.5px]">
            <thead>
              <tr>{["Client / booking", "Status", "Date & time", "Total", "Payment", "Balance", ""].map((h) => <th key={h} scope="col" className={`${bkHead} ${h === "Total" || h === "Balance" ? "text-end" : "text-start"}`}>{t(h)}</th>)}</tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">{bookings ? t("No bookings yet") : t("Loading…")}</td></tr>}
              {pageRows.map((b) => {
                const pay = bookingPayment(Number(b.total), Number(b.paid_amount), b.deposit_pct);
                const ps = payState(b);
                const done = b.status === "confirmed";
                const rated = (ratings ?? []).some((x) => x.booking_id === b.id);
                const canAct = b.status === "quoted" || b.status === "confirmed";
                return (
                  <tr key={b.id} className="transition-colors hover:bg-foreground/[.03]">
                    <td className={`${bkCell} min-w-[220px]`}>
                      <b className="block">{b.client_name}<span className="font-normal text-muted-foreground"> · {b.package_title}</span></b>
                      {b.invoice_no && <span className="text-xs text-muted-foreground">{b.invoice_no}</span>}
                    </td>
                    <td className={bkCell}><span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_STYLE[b.status] ?? STATUS_STYLE["cancelled"]}`}>{t(statusLabel(b.status))}</span></td>
                    <td className={`${bkCell} whitespace-nowrap`}>{b.event_date ? new Date(`${b.event_date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}<div className="text-xs text-muted-foreground">{b.start_time ? `${b.start_time.slice(0, 5)} – ${(b.end_time ?? "").slice(0, 5)}` : t("Time not set")}</div></td>
                    <td className={`${bkCell} whitespace-nowrap text-end font-semibold`} dir="ltr">{aed(Number(b.total))}</td>
                    <td className={bkCell}><span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${ps === "paid" ? "border-gold/50 bg-gold/15 text-gold" : ps === "partial" ? "border-gold/40 bg-gold/10 text-gold" : "border-border text-muted-foreground"}`}>{t(ps === "paid" ? "Paid" : ps === "partial" ? "Partially paid" : "Unpaid")}</span></td>
                    <td className={`${bkCell} whitespace-nowrap text-end`} dir="ltr">{aed(pay.balance)}</td>
                    <td className={`${bkCell} text-end`}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`${t("Actions")} ${b.client_name}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {b.status === "inquiry" && <DropdownMenuItem asChild><Link to="/approve/$id" params={{ id: b.id }} search={{ k: b.artist_key }}>{t("Review & approve")}</Link></DropdownMenuItem>}
                          {done && <DropdownMenuItem disabled={busy || Number(b.paid_amount) < Number(b.total) || !canComplete(b.status, b.event_date)} onSelect={() => run(() => complete$({ data: { id: b.id } }), "Marked completed — escrow released")}>{t("Mark completed")}</DropdownMenuItem>}
                          {canAct && canDispute(b.status, b.escrow_status) && <DropdownMenuItem disabled={busy} onSelect={() => { const r = prompt(t("Describe the problem for the Dealmaker team")); if (r) run(() => dispute$({ data: { id: b.id, reason: r } }), "Dispute opened"); }}>{t("Report problem")}</DropdownMenuItem>}
                          {b.status === "completed" && b.client_email && !rated && <DropdownMenuItem onSelect={() => setRate({ id: b.id, rating: 5, note: "" })}>{t("Rate client")}</DropdownMenuItem>}
                          <DropdownMenuItem onSelect={() => setInfo(b)}>{t("Booking information")}</DropdownMenuItem>
                          {canAct && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" disabled={busy} onSelect={() => { if (confirm(t("Cancel? The client gets a full refund."))) run(() => cancel$({ data: { id: b.id } }), "Booking cancelled"); }}>{t("Cancel booking")}</DropdownMenuItem></>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="dmr-q-foot flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">{t("Rows per page")}
            <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className="h-8 rounded-md border border-border bg-transparent px-2 text-xs">{[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <span className="text-xs text-muted-foreground">{filtered.length === 0 ? "0" : `${cur * size + 1}–${Math.min(filtered.length, cur * size + size)}`} {t("of")} {filtered.length}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={cur === 0} onClick={() => setPage(cur - 1)}>{t("Prev")}</Button>
            <Button size="sm" variant="outline" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>{t("Next")}</Button>
          </div>
        </div>
        <p className="px-5 pb-4 text-xs text-muted-foreground">{t("All totals in AED, incl. 5% VAT")}</p>
      </section>
      <Dialog open={!!info} onOpenChange={(o) => { if (!o) setInfo(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{info?.client_name} · {info?.package_title}</DialogTitle><DialogDescription>{t("Booking information")}</DialogDescription></DialogHeader>
          {info && (
            <table className="w-full text-sm"><tbody>
              {[["Job detail", info.job_detail ?? info.notes ?? "—"], ["Email", info.client_email ?? "—"], ["Invoice", info.invoice_no ?? "—"], ["Escrow", `${t(info.escrow_status)}${Number(info.refund_amount) > 0 ? ` · ${t("refunded")} ${aed(Number(info.refund_amount))}` : ""}`], ["Calendar", t(info.calendar_sync_status)], ["H-7 reminder", info.reminder_sent_at ? "Sent" : "Pending"], ["Calendar error", info.calendar_sync_error ?? "—"]].map(([k, v]) => <tr key={k} className="border-b border-border"><th className="py-2 pe-3 text-start font-medium">{t(k ?? "")}</th><td className="whitespace-pre-wrap break-words py-2">{v}</td></tr>)}
            </tbody></table>
          )}
          {info && (() => { const r = rep(info.client_email); return r ? <p className="text-xs" title={r.notes.join(" · ")}>{t("Client reputation (private):")} <b>{r.avg.toFixed(1)}★</b> {t("from")} {r.n} {t("booking")}{r.n > 1 ? t("s") : ""}</p> : null; })()}
        </DialogContent>
      </Dialog>
      <Dialog open={!!rate} onOpenChange={(o) => { if (!o) setRate(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("Rate this client privately (only artists see this)")}</DialogTitle><DialogDescription className="sr-only">{t("Rate client")}</DialogDescription></DialogHeader>
          {rate && (
            <div className="space-y-3">
              <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <Button variant="ghost" size="icon" key={n} type="button" aria-label={`${n} stars`} className={n <= rate.rating ? "text-gold" : "text-muted-foreground"} onClick={() => setRate({ ...rate, rating: n })}>★</Button>)}</div>
              <Input placeholder={t("Private note (optional)")} maxLength={500} value={rate.note} onChange={(e) => setRate({ ...rate, note: e.target.value })} />
              <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setRate(null)}>{t("Cancel")}</Button><Button onClick={() => { const b = bookings?.find((x) => x.id === rate.id); if (b) void saveRating(b); }}>{t("Save rating")}</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <aside className="dmr-b-side">
        <div className="dmr-panel dmr-b-card space-y-3">
          <h3 className="font-semibold">{t("Send booking offer")}</h3>
          <div><Label>{t("Conversation")}</Label>
            <Select value={f.conversationId} onValueChange={(v) => { const c = convs?.find((x) => x.id === v); setF({ ...f, conversationId: v, eventDate: c?.quote_requests?.event_date ?? f.eventDate }); }}>
              <SelectTrigger><SelectValue placeholder={t("Choose client")} /></SelectTrigger>
              <SelectContent>{convs?.map((c) => <SelectItem key={c.id} value={c.id}>{c.quote_requests?.name ?? t("Client")}{c.quote_requests?.event_date ? ` · ${c.quote_requests.event_date}` : ""}</SelectItem>)}</SelectContent>
            </Select></div>
          {packages && packages.length > 0 && <div><Label>{t("From package")}</Label>
            <Select onValueChange={(v) => { const pk = packages.find((x) => x.id === v); if (pk) setF({ ...f, title: pk.title, amount: String(pk.price) }); }}>
              <SelectTrigger><SelectValue placeholder={t("Optional")} /></SelectTrigger>
              <SelectContent>{packages.map((pk) => <SelectItem key={pk.id} value={pk.id}>{pk.title} · {aed(Number(pk.price))}</SelectItem>)}</SelectContent>
            </Select></div>}
          <div><Label>{t("Title")}</Label><Input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>{t("Price excl. VAT")} (AED)</Label><Input type="number" min={1} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
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
            <Button variant="outline" onClick={async () => { const { error } = await supabase.from("artists").update({ notify_phone: phone || null }).eq("id", artistId); if (error) toast.error(error.message); else toast.success(t("Saved")); }}>{t("Save")}</Button></div>
          <p className="text-xs text-muted-foreground">{t("Approval requests also go to your account email.")}</p>
        </div>
        <div className="dmr-panel dmr-b-card space-y-2">
          <h3 className="font-semibold">{t("VAT registration")}</h3>
          <Label>{t("TRN (shown on invoices)")}</Label>
          <div className="flex gap-2"><Input value={trnV} maxLength={15} onChange={(e) => setTrn(e.target.value.replace(/\D/g, ""))} placeholder={t("15 digits")} />
            <Button variant="outline" onClick={async () => { const { error } = await supabase.from("artists").update({ trn: trnV || null }).eq("id", artistId); if (error) toast.error(error.message); else toast.success(t("TRN saved")); }}>{t("Save")}</Button></div>
        </div></>}
      </aside>
    </div>
  );
}
