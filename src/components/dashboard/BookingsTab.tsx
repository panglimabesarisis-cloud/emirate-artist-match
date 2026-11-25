import { BulkBar, NOT_DELETABLE, RowCheckbox, bookingDeletable, useHideRows, useSelection } from "./BulkSelect";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowUpDown, MoreVertical, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { StudioHeading } from "./StudioPage";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { createBookingOffer, completeBooking, cancelBookingAsArtist, openDisputeAsArtist, markWorkReady } from "@/lib/bookings.functions";
import { offerClients } from "@/lib/offer-clients";
import { dueDate, rateItems, rushItems, type StoredRate } from "@/lib/ratecard";
import { dubaiToday } from "@/lib/unpaid-expiry";
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
  quoted: "border-transparent bg-[#3a3f4b] text-white", inquiry: "border-transparent bg-gradient-gold text-gold-foreground",
  confirmed: "border-emerald-400/35 bg-emerald-400/15 text-emerald-300", completed: "border-blue-400/40 bg-blue-400/10 text-blue-300",
  cancelled: "border-border bg-transparent text-muted-foreground line-through",
};
const PAY_STYLE: Record<string, string> = {
  unpaid: "border-red-400/30 bg-red-500/10 text-red-300", partial: "border-transparent bg-gold/40 text-white", paid: "border-transparent bg-gradient-gold text-gold-foreground",
};
const BADGE = "inline-flex h-[22px] min-w-[112px] items-center justify-center whitespace-nowrap rounded-full border px-2.5 text-[10.5px] font-extrabold tracking-[.03em]";
const CHIP = "inline-flex h-[22px] min-w-[72px] items-center justify-center whitespace-nowrap rounded-full border px-2.5 text-[10.5px] font-extrabold";
type SortKey = "client_name" | "status" | "event_date" | "total" | "balance";
const COLS: Array<[SortKey | "payment" | "calendar", string, boolean, boolean]> = [
  ["client_name", "Client / booking", true, false], ["status", "Status", true, false], ["event_date", "Date & time", true, false], ["total", "Total", true, true],
  ["payment", "Payment", false, false], ["balance", "Balance", true, true], ["calendar", "Calendar", false, false],
];
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
  const ready$ = useServerFn(markWorkReady);
  const cancel$ = useServerFn(cancelBookingAsArtist);
  const dispute$ = useServerFn(openDisputeAsArtist);
  const [phone, setPhone] = useState(notifyPhone ?? "");
  const key = ["artist-bookings", artistId];
  const { data: bookings } = useQuery({ queryKey: key, queryFn: async () => (await supabase.from("bookings").select("job_kind,work_ready_at,conversation_id,start_time,end_time,job_detail,notes,paid_amount,deposit_pct,calendar_sync_status,calendar_sync_error,reminder_sent_at,id, client_name, client_email, package_title, event_date, amount, total, status, escrow_status, invoice_no, refund_amount, is_seed, artist_key, drafted_by").eq("artist_id", artistId).is("deleted_at", null).eq("is_seed", false).order("created_at", { ascending: false })).data ?? [] });
  const { data: convs } = useQuery({ queryKey: ["offer-convs", artistId], queryFn: async () => (await supabase.from("conversations").select("id, client_name, client_user_id, entry_source, deleted_at, last_message_at, quote_requests(name, email, event_date, start_time, end_time)").eq("artist_id", artistId).is("deleted_at", null).order("last_message_at", { ascending: false }).limit(300)).data ?? [] });
  const { data: packages } = useQuery({ queryKey: ["offer-packages", artistId], queryFn: async () => (await supabase.from("rate_cards").select("id, title, price, items, rush_items, job_kind").eq("artist_id", artistId).order("sort")).data ?? [] });
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
  const emptyOffer = { conversationId: "", title: "", amount: "", eventDate: "", notes: "", startTime: "", endTime: "", rateCardId: "", rush: "" };
  const [f, setF] = useState(emptyOffer);
  const [trnV, setTrn] = useState(trn ?? "");
  const [busy, setBusy] = useState(false);
  const clients = offerClients(convs ?? [], bookings ?? []);
  const card = packages?.find((x) => x.id === f.rateCardId);
  const rushOptions = card ? rushItems(card) : [];
  const rush = f.rush === "" ? null : rushOptions[Number(f.rush)] ?? null;
  const deadline = card?.job_kind === "deliverable";
  const price = (Number(f.amount) || 0) + (rush?.price ?? 0);
  const p = priceBreakdown(price);

  const [page, setPage] = useState(0);
  const selection = useSelection();
  const hide = useHideRows("soft_delete_bookings", [key, ["contracts", artistId], ["cal-jobs", artistId]], () => selection.clear());
  const [sort, setSort] = useState<{ k: SortKey | "payment" | "calendar"; dir: 1 | -1 }>({ k: "event_date", dir: -1 });
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
    const list = (bookings ?? []).filter((b) => (filter === "all" || b.status === filter) && (!needle || `${b.client_name} ${b.package_title} ${b.invoice_no ?? ""}`.toLowerCase().includes(needle)));
    const val = (b: (typeof list)[number]): string | number => sort.k === "total" ? Number(b.total) : sort.k === "balance" ? bookingPayment(Number(b.total), Number(b.paid_amount), b.deposit_pct).balance : sort.k === "status" ? b.status : sort.k === "event_date" ? (b.event_date ?? "") : b.client_name;
    return [...list].sort((a, c) => { const A = val(a), C = val(c); return (typeof A === "number" && typeof C === "number" ? A - C : String(A).localeCompare(String(C))) * sort.dir; });
  }, [bookings, filter, search, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const cur = Math.min(page, pages - 1);
  const pageRows = filtered.slice(cur * size, cur * size + size);
  const deletableOnPage = pageRows.filter(bookingDeletable);

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
        <BulkBar count={selection.sel.length} busy={hide.busy} onClear={selection.clear} onDelete={() => void hide.run(selection.sel, "bookings")} />
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[1020px] border-separate border-spacing-0 text-[13.5px]">
            <thead>
              <tr>
                <th scope="col" className={`${bkHead} w-10`}><RowCheckbox label={t("Select all")} checked={deletableOnPage.length > 0 && deletableOnPage.every((b) => selection.has(b.id))} disabled={deletableOnPage.length === 0} onChange={(on) => selection.toggleAll(deletableOnPage.map((b) => b.id), on)} /></th>
                {COLS.map(([k, label, sortable, num]) => (
                  <th key={label} scope="col" aria-sort={sortable && sort.k === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined} className={`${bkHead} ${num ? "text-end" : "text-start"}`}>
                    {sortable ? (
                      <button type="button" onClick={() => setSort({ k, dir: sort.k === k ? (sort.dir === 1 ? -1 : 1) : 1 })} className={`inline-flex items-center gap-1.5 uppercase transition-colors hover:text-foreground ${sort.k === k ? "text-gold" : ""}`}>{t(label)}<ArrowUpDown className={`h-3 w-3 ${sort.k === k ? "opacity-100" : "opacity-40"}`} aria-hidden /></button>
                    ) : t(label)}
                  </th>
                ))}
                <th scope="col" className={bkHead}><span className="sr-only">{t("Actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">{bookings ? t("No bookings yet") : t("Loading…")}</td></tr>}
              {pageRows.map((b) => {
                const pay = bookingPayment(Number(b.total), Number(b.paid_amount), b.deposit_pct);
                const ps = payState(b);
                const done = b.status === "confirmed";
                const rated = (ratings ?? []).some((x) => x.booking_id === b.id);
                const canAct = b.status === "quoted" || b.status === "confirmed";
                const cancelled = b.status === "cancelled";
                return (
                  <tr key={b.id} className="transition-colors hover:bg-foreground/[.03]">
                    <td className={bkCell}><RowCheckbox label={`${t("Select")} ${b.client_name}`} checked={selection.has(b.id)} disabled={!bookingDeletable(b)} title={bookingDeletable(b) ? undefined : t(NOT_DELETABLE)} onChange={(on) => selection.toggle(b.id, on)} /></td>
                    <td className={`${bkCell} min-w-[230px] ${cancelled ? "opacity-45" : ""}`}>
                      <div className="flex flex-col gap-1">
                        <b className="font-bold">{b.client_name} <em className="font-medium not-italic text-muted-foreground">· {b.package_title}</em></b>
                        <small className="text-xs text-muted-foreground/70">{t("Escrow:")} {t(b.escrow_status)}</small>
                      </div>
                    </td>
                    <td className={bkCell}><span className={`${BADGE} ${STATUS_STYLE[b.status] ?? STATUS_STYLE["cancelled"]}`}>{t(statusLabel(b.status))}</span></td>
                    <td className={`${bkCell} whitespace-nowrap ${cancelled ? "opacity-45" : ""}`}><b className="block">{b.event_date ? new Date(`${b.event_date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</b><small className="text-xs text-muted-foreground">{b.start_time ? `${b.start_time.slice(0, 5)} – ${(b.end_time ?? "").slice(0, 5)}` : t("Time not set")}</small></td>
                    <td className={`${bkCell} whitespace-nowrap text-end ${cancelled ? "opacity-45" : ""}`} dir="ltr"><b>{aed(Number(b.total))}</b></td>
                    <td className={bkCell}><span className={`${CHIP} ${PAY_STYLE[ps]}`}>{t(ps === "paid" ? "Paid" : ps === "partial" ? "Partially paid" : "Unpaid")}</span></td>
                    <td className={`${bkCell} whitespace-nowrap text-end ${cancelled ? "opacity-45" : ""}`} dir="ltr">{aed(pay.balance)}</td>
                    <td className={`${bkCell} ${cancelled ? "opacity-45" : ""}`}><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><i className={`h-[7px] w-[7px] rounded-full ${b.calendar_sync_status === "synced" ? "bg-emerald-400" : b.calendar_sync_status === "error" || b.calendar_sync_status === "failed" ? "bg-red-500" : "bg-muted-foreground/50"}`} aria-hidden />{t(b.calendar_sync_status)}</span></td>
                    <td className={`${bkCell} text-end`}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`${t("Actions")} ${b.client_name}`}><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {b.status === "inquiry" && <DropdownMenuItem asChild><Link to="/approve/$id" params={{ id: b.id }} search={{ k: b.artist_key }}>{t("Review & approve")}</Link></DropdownMenuItem>}
                          {b.status === "confirmed" && Number(b.paid_amount) < Number(b.total) && <DropdownMenuItem disabled={busy || !!b.work_ready_at} onSelect={() => { if (confirm(t("Tell the client the work is ready and ask them to pay the balance?"))) void run(() => ready$({ data: { id: b.id } }), "Client asked to pay the balance"); }}>{t(b.work_ready_at ? "Balance requested" : "Work ready · ask for balance")}</DropdownMenuItem>}
                          {done && <DropdownMenuItem disabled={busy || Number(b.paid_amount) < Number(b.total) || !(b.job_kind === "deliverable" ? b.status === "confirmed" : canComplete(b.status, b.event_date))} onSelect={() => run(() => complete$({ data: { id: b.id } }), "Marked completed — escrow released")}>{t("Mark completed")}</DropdownMenuItem>}
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
        <p className="px-5 pb-4 text-xs text-muted-foreground">{t("All totals in AED, incl. 5% VAT")}. {t("Unpaid bookings are removed automatically once the event date has passed (hidden first, deleted permanently after 90 days).")}</p>
      </section>
      <Dialog open={!!info} onOpenChange={(o) => { if (!o) setInfo(null); }}>
        <DialogContent className="w-[min(600px,100%)] max-w-none rounded-[24px] border-border bg-gradient-to-b from-[#141a2e] to-[#0c1120] p-[26px]">
          {info && (() => {
            const pay = bookingPayment(Number(info.total), Number(info.paid_amount), info.deposit_pct);
            const rows: Array<[string, string | null]> = [
              ["Job detail", info.job_detail ?? info.notes ?? null], ["Email", info.client_email], ["Invoice", info.invoice_no],
              ["H-7 reminder", info.reminder_sent_at ? "Sent" : "Pending"], ["Calendar", info.calendar_sync_status], ["Calendar error", info.calendar_sync_error],
              ["Escrow", `${info.escrow_status}${Number(info.refund_amount) > 0 ? ` · ${t("refunded")} ${aed(Number(info.refund_amount))}` : ""}`],
              ["Payment", payState(info) === "paid" ? "Paid" : payState(info) === "partial" ? "Partially paid" : "Unpaid"],
            ];
            const r = rep(info.client_email);
            return (
              <>
                <DialogHeader className="items-start text-start">
                  <span className={`${BADGE} ${STATUS_STYLE[info.status] ?? STATUS_STYLE["cancelled"]}`}>{t(statusLabel(info.status))}</span>
                  <DialogTitle className="mt-2.5 font-display text-[30px] font-normal leading-tight">{info.client_name} · {info.package_title}</DialogTitle>
                  <DialogDescription>{info.event_date ? new Date(`${info.event_date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"} · {info.start_time ? `${info.start_time.slice(0, 5)} – ${(info.end_time ?? "").slice(0, 5)}` : t("Time not set")} · {aed(Number(info.total))} {t("incl. VAT")}</DialogDescription>
                </DialogHeader>
                <div className="mb-4 mt-1.5 grid grid-cols-1 overflow-hidden rounded-2xl border border-border sm:grid-cols-3">
                  {([["Total", aed(Number(info.total))], ["Paid", aed(Number(info.paid_amount))], ["Balance", aed(pay.balance)]] as const).map(([l, v], i) => (
                    <div key={l} className={`px-3.5 py-3 ${i < 2 ? "border-b border-border sm:border-b-0 sm:border-e" : ""}`}>
                      <span className="block text-[10.5px] font-extrabold uppercase tracking-[.1em] text-muted-foreground">{t(l)}</span>
                      <b className="font-display text-2xl font-normal" dir="ltr">{v}</b>
                    </div>
                  ))}
                </div>
                <dl className="grid grid-cols-[150px_1fr] border-t border-border max-sm:grid-cols-1">
                  {rows.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="border-b border-border pb-3 pt-3.5 text-[11px] font-extrabold uppercase tracking-[.1em] text-muted-foreground max-sm:border-b-0 max-sm:pb-0">{t(k)}</dt>
                      <dd className={`whitespace-pre-wrap break-words border-b border-border py-3 text-sm ${v ? "" : "text-muted-foreground/60"}`}>{v ? t(v) : t("Not set")}</dd>
                    </div>
                  ))}
                </dl>
                {r && <p className="text-xs text-muted-foreground" title={r.notes.join(" · ")}>{t("Client reputation (private):")} <b>{r.avg.toFixed(1)}★</b> {t("from")} {r.n} {t("booking")}{r.n > 1 ? t("s") : ""}</p>}
                <div className="mt-1.5 flex flex-wrap justify-end gap-2.5">
                  {info.status === "inquiry" && <Button asChild className="rounded-full bg-gradient-gold font-bold text-gold-foreground"><Link to="/approve/$id" params={{ id: info.id }} search={{ k: info.artist_key }}>{t("Review & approve")} →</Link></Button>}
                  {(info.status === "quoted" || info.status === "confirmed") && <Button variant="outline" className="rounded-full border-red-400/40 text-red-300" disabled={busy} onClick={() => { if (confirm(t("Cancel? The client gets a full refund."))) { setInfo(null); void run(() => cancel$({ data: { id: info.id } }), "Booking cancelled"); } }}>{t("Cancel booking")}</Button>}
                  <Button variant="outline" className="rounded-full" onClick={() => setInfo(null)}>{t("Close")}</Button>
                </div>
              </>
            );
          })()}
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
            <Select value={f.conversationId} onValueChange={(v) => { const c = clients.find((x) => x.id === v); setF({ ...f, conversationId: v, eventDate: c?.eventDate ?? f.eventDate, startTime: c?.startTime?.slice(0, 5) ?? f.startTime, endTime: c?.endTime?.slice(0, 5) ?? f.endTime }); }}>
              <SelectTrigger><SelectValue placeholder={t("Choose client")} /></SelectTrigger>
              <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.eventDate ? ` · ${c.eventDate}` : c.lastMessageAt ? ` · ${t("chat")} ${c.lastMessageAt.slice(0, 10)}` : ""}</SelectItem>)}</SelectContent>
            </Select><p className="mt-1 text-xs text-muted-foreground">{t("One entry per named client, newest chat first.")}</p></div>
          {packages && packages.length > 0 && <div><Label>{t("From package")}</Label>
            <Select value={f.rateCardId} onValueChange={(v) => { const pk = packages.find((x) => x.id === v); if (!pk) return; const due = pk.job_kind === "deliverable" ? dueDate(dubaiToday(), rateItems(pk as unknown as StoredRate).find((i) => i.turnaround)?.turnaround) : null; setF({ ...f, rateCardId: v, rush: "", title: pk.title, amount: String(pk.price), eventDate: due ?? f.eventDate }); }}>
              <SelectTrigger><SelectValue placeholder={t("Optional")} /></SelectTrigger>
              <SelectContent>{packages.map((pk) => <SelectItem key={pk.id} value={pk.id}>{pk.title} · {aed(Number(pk.price))}</SelectItem>)}</SelectContent>
            </Select></div>}
          {rushOptions.length > 0 && <div><Label>{t("Rush job")}</Label>
            <Select value={f.rush === "" ? "none" : f.rush} onValueChange={(v) => { const picked = v === "none" ? null : rushOptions[Number(v)]; setF({ ...f, rush: v === "none" ? "" : v, eventDate: (picked ? dueDate(dubaiToday(), picked.rush) : null) ?? f.eventDate }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">{t("No rush")}</SelectItem>{rushOptions.map((r, i) => <SelectItem key={i} value={String(i)}>{r.rush} · {r.desc} · + {aed(r.price)}</SelectItem>)}</SelectContent>
            </Select></div>}
          <div><Label>{t("Title")}</Label><Input value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>{t("Price excl. VAT")} (AED)</Label><Input type="number" min={1} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div><Label>{t(deadline ? "Deadline" : "Event date")}</Label><Input type="date" value={f.eventDate} onChange={(e) => setF({ ...f, eventDate: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="offer-start">{t("Start time")}</Label><Input id="offer-start" type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></div>
            <div><Label htmlFor="offer-end">{t("End time")}</Label><Input id="offer-end" type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></div>
          </div>
          <div><Label>{t("Notes")}</Label><Textarea rows={2} maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          <div className="dmr-vat"><div><span>{t("Price")}</span><b>{aed(price)}</b></div><div><span>{t("VAT 5%")}</span><b>{aed(p.vat)}</b></div><div><span>{t("Client pays")}</span><b>{aed(p.total)}</b></div></div>
          <Button className="w-full" disabled={busy || !f.conversationId || !f.eventDate || !(Number(f.amount) > 0)}
            onClick={() => run(async () => { const { rush: _rush, ...offer } = f; await offer$({ data: { ...offer, amount: Number(f.amount), rushIndex: f.rush === "" ? null : Number(f.rush) } }); setF(emptyOffer); }, "Offer sent to the client's chat")}>{t("Send offer")}</Button>
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
