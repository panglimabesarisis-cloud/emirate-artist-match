import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Eye } from "lucide-react";
import { getAdminFinance } from "@/lib/admin-control.functions";
import { aed } from "@/lib/format";
import { toCsv, downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const states = ["all", "none", "held", "release_pending", "frozen", "released", "partially_refunded", "refunded"];
type FinanceRow = Awaited<ReturnType<typeof getAdminFinance>>["rows"][number];
const money = (value: number | null) => value === null ? "Not recorded" : aed(value);

export function AdminFinance({ bookings = false }: { bookings?: boolean }) {
  const fetchPage = useServerFn(getAdminFinance);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("all");
  const [detail, setDetail] = useState<FinanceRow | null>(null);
  const query = useQuery({ queryKey: ["admin-finance", page, search, status], queryFn: () => fetchPage({ data: { page, search, status } }), staleTime: 30_000 });
  const rows = query.data?.rows ?? [];
  return <>
    <form className="admin-toolbar" onSubmit={(event) => { event.preventDefault(); setSearch(draft); setPage(0); }}>
      <Input aria-label="Search bookings" type="search" placeholder="Invoice, artist or client" maxLength={120} value={draft} onChange={(event) => setDraft(event.target.value)} />
      <Button type="submit" variant="outline" size="sm">Search</Button>
      <Select value={status} onValueChange={(value) => { setStatus(value); setPage(0); }}><SelectTrigger className="w-44" aria-label="Escrow status"><SelectValue /></SelectTrigger><SelectContent>{states.map((value) => <SelectItem key={value} value={value}>{value === "all" ? "All escrow states" : value.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select>
      <Button type="button" variant="outline" size="sm" disabled={!rows.length} onClick={() => downloadCsv("dealmaker-booking-allocations-page.csv", toCsv(rows, [["Invoice", r => r.invoice_no], ["Artist", r => r.artist_name], ["Client", r => r.client_name], ["Escrow", r => r.escrow_status], ["Collected", r => r.paid_amount], ["Refunded", r => r.refund_amount], ["Artist entitlement", r => r.allocation.artist], ["Platform fee", r => r.allocation.fee], ["Client commission", r => r.allocation.client], ["Platform retained", r => r.allocation.retained]]))}><Download />Export page</Button>
    </form>
    <div className="admin-table-wrap"><table><thead><tr><th>Booking</th><th>Artist / client</th><th>{bookings ? "Event" : "Artist entitlement"}</th><th>{bookings ? "Collected" : "Platform fee"}</th><th>{bookings ? "Booking status" : "Client commission"}</th><th>Escrow</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>
      {query.isPending && <tr><td colSpan={7}>Loading bookings…</td></tr>}
      {query.error && <tr><td colSpan={7} role="alert">Could not load bookings. <Button variant="ghost" onClick={() => void query.refetch()}>Retry</Button></td></tr>}
      {!query.isPending && !query.error && !rows.length && <tr><td colSpan={7}>No bookings match these filters.</td></tr>}
      {rows.map(row => <tr key={row.id}><td><b>{row.invoice_no ?? `BK-${row.id.slice(0, 8).toUpperCase()}`}</b><div className="admin-row-detail">{row.package_title ?? "Booking"}</div></td><td>{row.artist_name}<div className="admin-row-detail">{row.client_name}</div></td><td className="admin-money">{bookings ? row.event_date : money(row.allocation.artist)}</td><td className="admin-money">{bookings ? aed(row.paid_amount) : money(row.allocation.fee)}</td><td>{bookings ? row.status : <><span className="admin-money">{aed(row.allocation.client)}</span><div className="admin-row-detail">{row.client_commission_status ?? "Not accrued"}</div></>}</td><td><Badge variant={row.escrow_status === "frozen" ? "destructive" : "secondary"}>{row.escrow_status.replaceAll("_", " ")}</Badge></td><td><Button size="icon" variant="ghost" aria-label={`View booking ${row.invoice_no ?? row.id}`} onClick={() => setDetail(row)}><Eye /></Button></td></tr>)}
    </tbody></table></div>
    <div className="admin-page-foot"><span>{query.data?.total ?? 0} bookings · page {page + 1}</span><div className="admin-foot-actions"><Button variant="outline" size="sm" disabled={page === 0 || query.isFetching} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * 25 >= (query.data?.total ?? 0) || query.isFetching} onClick={() => setPage(page + 1)}>Next</Button></div></div>
    <Dialog open={detail !== null} onOpenChange={(open) => { if (!open) setDetail(null); }}><DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Booking allocation</DialogTitle><DialogDescription>{detail?.invoice_no ?? "Booking"} · Agreement values are not withdrawable wallet balances.</DialogDescription></DialogHeader>{detail && <>
      <dl className="admin-detail-grid">
        {[["Artist", detail.artist_name], ["Client", detail.client_name], ["Service before VAT", aed(detail.amount)], ["VAT", aed(detail.vat_amount)], ["Collected", aed(detail.paid_amount)], ["Refunded", aed(detail.refund_amount)], ["Saved artist commission", detail.commission_rate === null ? "Not recorded" : `${detail.commission_rate}% (${detail.commission_basis ?? "saved"})`], ["Saved client commission", detail.client_commission_pct === null ? "Not accrued" : `${detail.client_commission_pct}%`], ["Artist entitlement", money(detail.allocation.artist)], ["Platform gross fee", money(detail.allocation.fee)], ["Client reward from platform fee", money(detail.allocation.client)], ["Platform retained", money(detail.allocation.retained)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {(detail.allocation.shortfall ?? 0) > 0 && <p role="alert" className="text-destructive text-sm">Platform fee shortfall: {money(detail.allocation.shortfall)}. Artist entitlement is unchanged.</p>}
      <p className="text-sm text-muted-foreground">Client reward: {detail.client_commission_status ?? "not accrued"}. Escrow: {detail.escrow_status.replaceAll("_", " ")}. Partial collections are shown separately from agreed allocations. VAT is not platform revenue. Payments are demo-only.</p>
    </>}</DialogContent></Dialog>
  </>;
}