import { BulkBar, RowCheckbox, useHideRows, useSelection } from "./BulkSelect";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invoiceMoney, type Invoice } from "@/lib/invoice";
import { bookingPayment } from "@/lib/booking-payment-rules";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InvoicePreviewDialog } from "./InvoicePreviewDialog";
import type { PaperData, PaperStatus } from "./InvoicePaper";

type RawInvoice = NonNullable<ReturnType<typeof useInvoiceQuery>["data"]>[number];
export function toInvoiceRows(data: RawInvoice[]) {
  return data.map((row) => {
    const paid = row.bookings ? Math.min(Number(row.total), Number(row.bookings.paid_amount)) : row.status === "paid" ? Number(row.total) : 0;
    const percent = bookingPayment(Number(row.total), paid, 100).percent;
    return { ...row, paid, percent, client: row.bookings?.client_name ?? row.conversations?.quote_requests?.name ?? `Direct chat · ${row.conversation_id.slice(0, 8)}` };
  });
}
export function useInvoiceQuery(artistId?: string) {
  return useQuery({
    queryKey: ["invoice-records", artistId], refetchInterval: 5000,
    queryFn: async () => {
      let query = supabase.from("service_invoices").select("id, number, document, total, status, paid_at, created_at, conversation_id, hidden_at, artists(stage_name, trn), bookings(client_name, client_email, total, paid_amount, deposit_pct), conversations(quote_requests(name))").order("created_at", { ascending: false });
      if (artistId) query = query.eq("artist_id", artistId).is("deleted_at", null);
      const result = await query;
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
}
export type InvoiceRow = ReturnType<typeof toInvoiceRows>[number];
/** Everything the cream invoice sheet needs, from a stored invoice row. */
export function paperFor(r: InvoiceRow): PaperData {
  const doc = r.document as unknown as Invoice;
  const status: PaperStatus = r.status === "paid" ? "paid" : r.paid > 0 ? "partial" : "unpaid";
  return { number: r.number, artistName: r.artists?.stage_name ?? "", client: r.client, clientEmail: r.bookings?.client_email ?? null, issued: r.created_at.slice(0, 10), due: doc.due ?? null,
    items: doc.items ?? [], subtotal: Number(doc.subtotal ?? 0), vat: Number(doc.vat ?? 0), total: Number(r.total), paid: r.paid, paidAt: r.paid_at, status, notes: doc.notes ?? null, trn: r.artists?.trn ?? null };
}
const fmtD = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const payOf = (r: InvoiceRow) => (r.status === "paid" ? "paid" : r.paid > 0 ? "partial" : "unpaid");
const CHIP_STYLE: Record<string, string> = {
  unpaid: "border-red-400/30 bg-red-500/10 text-red-300", partial: "border-transparent bg-gold/40 text-white", paid: "border-transparent bg-gradient-gold text-gold-foreground",
};
const ih = "whitespace-nowrap border-b border-border bg-card px-3.5 py-3 text-[11px] font-extrabold uppercase tracking-[.1em] text-muted-foreground";
const ic = "whitespace-nowrap border-b border-border px-3.5 py-3.5 align-middle";

/** Artist view of the sent invoices, laid out as in the design reference. */
const invoiceDeletable = (r: InvoiceRow) => r.status !== "paid" && r.paid === 0;

function ArtistInvoiceTable({ artistId, rows, isPending, error, onView }: { artistId: string; rows: InvoiceRow[]; isPending: boolean; error: unknown; onView: (r: InvoiceRow) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "unpaid" | "partial" | "paid">("all");
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(0);
  const selection = useSelection();
  const hide = useHideRows("soft_delete_invoices", [["invoice-records", artistId], ["invoices", artistId]], () => selection.clear());
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [hiding, setHiding] = useState(false);
  const hiddenCount = rows.filter((r) => r.hidden_at).length;
  /** Hide (or show again) invoices in this list. Nothing is deleted and the invoices stay archived. */
  const setHidden = async (ids: string[], hidden: boolean) => {
    if (ids.length === 0) return;
    setHiding(true);
    const { error } = await supabase.rpc("set_invoices_hidden", { _ids: ids, _hidden: hidden });
    setHiding(false);
    if (error) { toast.error(t("Could not update the invoices")); return; }
    toast.success(`${ids.length} ${t(hidden ? "hidden from the list" : "shown again")}`);
    selection.clear();
    void qc.invalidateQueries({ queryKey: ["invoice-records", artistId] });
  };
  const listed = showAll ? rows : rows.filter((r) => !r.hidden_at);
  const counts = { all: listed.length, unpaid: listed.filter((r) => payOf(r) === "unpaid").length, partial: listed.filter((r) => payOf(r) === "partial").length, paid: listed.filter((r) => payOf(r) === "paid").length };
  const needle = q.trim().toLowerCase();
  const list = listed.filter((r) => (tab === "all" || payOf(r) === tab) && (!needle || `${r.number} ${r.client}`.toLowerCase().includes(needle)));
  const pages = Math.max(1, Math.ceil(list.length / size));
  const cur = Math.min(page, pages - 1);
  const shown = list.slice(cur * size, cur * size + size);
  const selectableOnPage = shown;
  const picked = rows.filter((r) => selection.has(r.id));
  return (
    <>
      <div className="dmr-q-tools">
        <div className="me-auto"><h2 className="font-display text-[28px] leading-none">{t("Sent invoices")}</h2><small className="text-xs text-muted-foreground">{t("Newest first")}</small></div>
        <label className="relative flex max-w-md flex-1 basis-64 items-center">
          <Search className="pointer-events-none absolute start-3.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="sr-only">{t("Search invoices")}</span>
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={t("Search invoice number or client")} className="h-10 w-full rounded-full border border-border bg-foreground/[.04] pe-4 ps-10 text-sm outline-none focus-visible:border-gold" />
        </label>
        <Button type="button" variant="outline" size="sm" className="rounded-full" aria-pressed={showAll} onClick={() => { setShowAll(!showAll); setPage(0); }}>{showAll ? <EyeOff className="me-1.5 h-3.5 w-3.5" /> : <Eye className="me-1.5 h-3.5 w-3.5" />}{showAll ? t("Hide hidden invoices") : t("Show all invoices")}{hiddenCount > 0 && <span className="ms-1.5 rounded-full bg-gold/20 px-1.5 text-[11px] text-gold">{hiddenCount}</span>}</Button>
        <div className="flex gap-0.5 rounded-xl bg-foreground/[.04] p-[3px]" role="group" aria-label={t("Filter by payment")}>
          {([["all", "All"], ["unpaid", "Unpaid"], ["partial", "Partially paid"], ["paid", "Paid"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => { setTab(k); setPage(0); }} className={`rounded-[10px] px-3.5 py-1.5 text-[13px] font-semibold ${tab === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{t(l)} <span className="opacity-60">{counts[k]}</span></button>)}
        </div>
      </div>
      <BulkBar count={selection.sel.length} busy={hide.busy || hiding} onClear={selection.clear} onDelete={() => { const ids = picked.filter(invoiceDeletable).map((r) => r.id); if (ids.length === 0) toast.error(t("Paid invoices can't be deleted. Use Hide from list instead.")); else void hide.run(ids, "invoices"); }}>
        <Button size="sm" variant="outline" className="rounded-full" disabled={hiding} onClick={() => void setHidden(picked.filter((r) => !r.hidden_at).map((r) => r.id), true)}><EyeOff className="me-1 h-3.5 w-3.5" />{t("Hide from list")}</Button>
        {picked.some((r) => r.hidden_at) && <Button size="sm" variant="outline" className="rounded-full" disabled={hiding} onClick={() => void setHidden(picked.filter((r) => r.hidden_at).map((r) => r.id), false)}><Eye className="me-1 h-3.5 w-3.5" />{t("Show again")}</Button>}
      </BulkBar>
      {error ? <p role="alert" className="p-5 text-destructive">{t("Could not load invoices.")}</p> : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[960px] border-separate border-spacing-0 text-[13.5px]">
            <thead><tr><th scope="col" className={`${ih} w-10`}><RowCheckbox label={t("Select all")} checked={selectableOnPage.length > 0 && selectableOnPage.every((r) => selection.has(r.id))} disabled={selectableOnPage.length === 0} onChange={(on) => selection.toggleAll(selectableOnPage.map((r) => r.id), on)} /></th>{["Invoice", "Client", "Issued", "Due", "Total", "Payment", "Balance", "Paid at"].map((h) => <th key={h} scope="col" className={`${ih} ${h === "Total" || h === "Balance" ? "text-end" : "text-start"}`}>{t(h)}</th>)}</tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-muted-foreground"><b className="block font-display text-2xl">{isPending ? t("Loading…") : t("No invoices found")}</b>{!isPending && t("Try another number or payment status.")}</td></tr>}
              {shown.map((r) => {
                const ps = payOf(r);
                const due = (r.document as { due?: string | null } | null)?.due ?? null;
                return (
                  <tr key={r.id} className={`transition-colors hover:bg-foreground/[.03] ${r.hidden_at ? "opacity-55" : ""}`}>
                    <td className={ic}><RowCheckbox label={`${t("Select")} ${r.number}`} checked={selection.has(r.id)} onChange={(on) => selection.toggle(r.id, on)} /></td>
                    <td className={ic}><button type="button" className="font-bold text-gold underline-offset-2 hover:underline" onClick={() => onView(r)}>{r.number}</button>{r.hidden_at && <span className="ms-2 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t("Hidden")}</span>}</td>
                    <td className={ic}><b>{r.client}</b></td>
                    <td className={ic}>{fmtD(r.created_at)}</td>
                    <td className={ic}>{fmtD(due)}</td>
                    <td className={`${ic} text-end`} dir="ltr"><b>{invoiceMoney(Number(r.total))}</b></td>
                    <td className={ic}><span className={`inline-flex h-[22px] min-w-[72px] items-center justify-center rounded-full border px-2.5 text-[10.5px] font-extrabold ${CHIP_STYLE[ps]}`}>{ps === "paid" ? t("Paid") : ps === "partial" ? `${t("Paid")} ${r.percent}%` : t("Unpaid")}</span></td>
                    <td className={`${ic} text-end`} dir="ltr">{invoiceMoney(Math.max(0, Number(r.total) - r.paid))}</td>
                    <td className={ic}>{r.paid_at ? fmtD(r.paid_at) : <span className="text-muted-foreground/60">{t("Not paid")}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="dmr-q-foot flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">{t("Rows per page")}
          <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className="h-8 rounded-md border border-border bg-transparent px-2 text-xs">{[5, 10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <span className="text-xs text-muted-foreground">{list.length === 0 ? "0" : `${cur * size + 1}–${Math.min(list.length, cur * size + size)}`} {t("of")} {list.length}</span>
        <div className="flex gap-2"><Button size="sm" variant="outline" disabled={cur === 0} onClick={() => setPage(cur - 1)}>{t("Prev")}</Button><Button size="sm" variant="outline" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>{t("Next")}</Button></div>
      </div>
    </>
  );
}

export function InvoiceRecords({ artistId }: { artistId?: string }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [preview, setPreview] = useState<PaperData | null>(null);
  const { data = [], isPending, error } = useInvoiceQuery(artistId);
  const rows = toInvoiceRows(data);
  const filtered = rows.filter(row => `${row.number} ${row.client} ${row.artists?.stage_name}`.toLowerCase().includes(search.toLowerCase()) && (status === "all" || (status === "paid" ? row.status === "paid" : status === "partial" ? row.paid > 0 && row.status !== "paid" : row.paid === 0)));
  if (artistId) {
    return <section className="studio-invoice-records">
      <ArtistInvoiceTable artistId={artistId} rows={rows} isPending={isPending} error={error} onView={(row) => setPreview(paperFor(row))} />
      <InvoicePreviewDialog data={preview} onClose={() => setPreview(null)} />
    </section>;
  }
  return <section className="space-y-4 studio-invoice-records">
    {!artistId && <div className="grid gap-4 border-b pb-5 sm:grid-cols-3">{[["Total invoiced", rows.reduce((s,r)=>s+Number(r.total),0)], ["Total paid", rows.reduce((s,r)=>s+r.paid,0)], ["Outstanding balance", rows.reduce((s,r)=>s+Math.max(0,Number(r.total)-r.paid),0)]].map(([label,value])=><div key={label}><p className="text-sm text-muted-foreground">{t(String(label))}</p><p className="mt-1 text-xl font-semibold">{invoiceMoney(Number(value))}</p></div>)}</div>}
    <div className="dmr-q-tools"><Input aria-label={t("Search invoices")} placeholder={t("Search invoices")} className="max-w-xs" value={search} onChange={e=>setSearch(e.target.value)}/><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44" aria-label={t("Payment status")}><SelectValue/></SelectTrigger><SelectContent>{[["all","All payments"],["unpaid","Unpaid"],["partial","Partially paid"],["paid","Paid 100%"]].map(([value,label])=><SelectItem key={value} value={value ?? "all"}>{t(label ?? "")}</SelectItem>)}</SelectContent></Select></div>
    {error ? <p role="alert" className="text-destructive">{t("Could not load invoices.")}</p> : <div className="dmr-tbl-wrap"><table className="w-full text-sm" data-studio-table="true"><thead className="border-b bg-muted"><tr>{["Invoice", ...(!artistId ? ["Artist"] : []), "Client", "Total", "Payment", "Balance", "Paid at", "View"].map(h=><th key={h} className="p-3 text-start whitespace-nowrap">{t(h)}</th>)}</tr></thead><tbody>{filtered.map(row=><tr key={row.id} className="border-b"><td className="p-3 whitespace-nowrap" data-label={t("Invoice")}>{row.number}</td>{!artistId && <td className="p-3" data-label={t("Artist")}>{row.artists?.stage_name}</td>}<td className="p-3" data-label={t("Client")}>{row.client}</td><td className="p-3 whitespace-nowrap" data-label={t("Total")}>{invoiceMoney(Number(row.total))}</td><td className="p-3 whitespace-nowrap" data-label={t("Payment")}><Badge variant={row.status === "paid" ? "default" : "secondary"}>{row.status === "paid" ? t("Paid 100%") : row.paid > 0 ? `${t("Paid")} ${row.percent}%` : t("Unpaid")}</Badge></td><td className="p-3 whitespace-nowrap" data-label={t("Balance")}>{invoiceMoney(Math.max(0,Number(row.total)-row.paid))}</td><td className="p-3 whitespace-nowrap" data-label={t("Paid at")}>{row.paid_at ? new Date(row.paid_at).toLocaleString("en-GB") : "—"}</td><td className="p-3" data-label={t("View")}><Button size="icon" variant="ghost" title={t("Invoice preview")} aria-label={`View ${row.number}`} onClick={() => setPreview(paperFor(row))}><Eye className="size-4"/></Button></td></tr>)}{!filtered.length && <tr><td colSpan={artistId ? 7 : 8} className="p-8 text-center text-muted-foreground">{t(isPending ? "Loading…" : "No invoices yet.")}</td></tr>}</tbody></table></div>}
    <InvoicePreviewDialog data={preview} onClose={() => setPreview(null)} />
  </section>;
}