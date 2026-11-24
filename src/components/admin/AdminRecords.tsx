import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toCsv, downloadCsv } from "@/lib/csv";

export type RecordKind = "transactions" | "credits" | "notifications" | "audit" | "roles";
type Row = { id: string; reference: string; subject: string; value: string; status: string; date: string; details: [string, string][] };
const when = (date: string | null) => date ? new Date(date).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }) : "Not recorded";

async function loadRows(kind: RecordKind, page: number): Promise<{ rows: Row[]; total: number }> {
  const from = page * 25;
  if (kind === "transactions") {
    const result = await supabase.from("payment_orders").select("id,kind,status,amount_minor,currency,environment,processor_amount_minor,processor_currency,paid_at,created_at,refunded_accounting_amount,artists(stage_name)", { count: "exact" }).order("created_at", { ascending: false }).order("id").range(from, from + 24);
    if (result.error) throw result.error;
    return { total: result.count ?? 0, rows: (result.data ?? []).map(r => ({ id: r.id, reference: r.id.slice(0, 8).toUpperCase(), subject: `${r.artists?.stage_name ?? "Artist"} · ${r.kind.replaceAll("_", " ")}`, value: `${r.currency} ${(r.amount_minor / 100).toFixed(2)}`, status: r.status, date: r.created_at, details: [["Mode", r.environment], ["Accounting", `${r.currency} ${(r.amount_minor / 100).toFixed(2)}`], ["Processor amount (minor units)", r.processor_amount_minor === null ? "Not recorded" : `${r.processor_currency} ${r.processor_amount_minor}`], ["Paid", when(r.paid_at)], ["Refunded accounting (minor units)", String(r.refunded_accounting_amount)]] })) };
  }
  if (kind === "credits") {
    const result = await supabase.from("credit_ledger").select("id,reason,delta,delta_fraction,model,tokens_in,tokens_out,final_charge_credits,created_at,artists(stage_name)", { count: "exact" }).order("created_at", { ascending: false }).order("id").range(from, from + 24);
    if (result.error) throw result.error;
    return { total: result.count ?? 0, rows: (result.data ?? []).map(r => ({ id: r.id, reference: r.id.slice(0, 8).toUpperCase(), subject: r.artists?.stage_name ?? "Artist", value: `${Number(r.delta) + Number(r.delta_fraction)} credits`, status: r.reason, date: r.created_at, details: [["Model", r.model ?? "Not applicable"], ["Input tokens", r.tokens_in === null ? "Not recorded" : String(r.tokens_in)], ["Output tokens", r.tokens_out === null ? "Not recorded" : String(r.tokens_out)], ["Final charge", r.final_charge_credits === null ? "Not applicable" : `${r.final_charge_credits} credits`]] })) };
  }
  if (kind === "notifications") {
    const result = await supabase.from("notifications").select("id,kind,channel,audience,recipient,status,created_at", { count: "exact" }).order("created_at", { ascending: false }).order("id").range(from, from + 24);
    if (result.error) throw result.error;
    return { total: result.count ?? 0, rows: (result.data ?? []).map(r => ({ id: r.id, reference: r.kind.replaceAll("_", " "), subject: r.recipient ?? "Not recorded", value: r.channel, status: r.status, date: r.created_at, details: [["Audience", r.audience], ["Channel", r.channel], ["Delivery status", r.status]] })) };
  }
  if (kind === "audit") {
    const result = await supabase.from("library_audit").select("id,kind,item_id,action,actor,changed_at", { count: "exact" }).order("changed_at", { ascending: false }).order("id").range(from, from + 24);
    if (result.error) throw result.error;
    return { total: result.count ?? 0, rows: (result.data ?? []).map(r => ({ id: r.id, reference: r.item_id.slice(0, 8), subject: r.kind, value: r.actor?.slice(0, 8) ?? "System", status: r.action, date: r.changed_at, details: [["Item", r.item_id], ["Actor", r.actor ?? "System"], ["Action", r.action]] })) };
  }
  const result = await supabase.from("user_roles").select("id,user_id,role", { count: "exact" }).order("user_id").order("id").range(from, from + 24);
  if (result.error) throw result.error;
  const ids = [...new Set((result.data ?? []).map(r => r.user_id))];
  const profiles = ids.length ? await supabase.from("profiles").select("id,display_name").in("id", ids) : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  return { total: result.count ?? 0, rows: (result.data ?? []).map(r => ({ id: r.id, reference: r.user_id.slice(0, 8), subject: profiles.data?.find(p => p.id === r.user_id)?.display_name ?? "Account", value: r.role, status: "Assigned", date: "", details: [["Account", r.user_id], ["Role", r.role]] })) };
}

export function AdminRecords({ kind }: { kind: RecordKind }) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Row | null>(null);
  const query = useQuery({ queryKey: ["admin-records", kind, page], queryFn: () => loadRows(kind, page), staleTime: 30_000 });
  const rows = (query.data?.rows ?? []).filter(r => `${r.reference} ${r.subject} ${r.status}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    {kind === "audit" && <p className="text-sm text-muted-foreground mb-4">Library change history. Other actions retain their existing booking, payment and verification records.</p>}
    <div className="admin-toolbar"><Input type="search" aria-label="Search current page" placeholder="Search current page" value={search} onChange={event => setSearch(event.target.value)} /><Button variant="outline" disabled={!rows.length} onClick={() => downloadCsv(`dealmaker-${kind}-page.csv`, toCsv(rows, [["Reference", r => r.reference], ["Subject", r => r.subject], ["Value", r => r.value], ["Status", r => r.status], ["Date", r => r.date]]))}><Download />Export page</Button></div>
    <div className="admin-table-wrap"><table><thead><tr><th>Reference</th><th>Account / subject</th><th>Value / channel</th><th>Status</th><th>Dubai time</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>
      {query.isPending && <tr><td colSpan={6}>Loading records…</td></tr>}{query.error && <tr><td colSpan={6} role="alert">Unable to load records. <Button variant="ghost" onClick={() => void query.refetch()}>Retry</Button></td></tr>}
      {!query.isPending && !query.error && !rows.length && <tr><td colSpan={6}>No records on this page.</td></tr>}
      {rows.map(r => <tr key={r.id}><td>{r.reference}</td><td>{r.subject}</td><td className="admin-money">{r.value}</td><td><Badge variant="secondary">{r.status}</Badge></td><td>{r.date ? when(r.date) : "Not recorded"}</td><td><Button variant="ghost" size="icon" aria-label={`View ${r.reference}`} onClick={() => setDetail(r)}><Eye /></Button></td></tr>)}
    </tbody></table></div>
    <div className="admin-page-foot"><span>{query.data?.total ?? 0} records · page {page + 1}</span><div className="admin-foot-actions"><Button variant="outline" size="sm" disabled={page === 0 || query.isFetching} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * 25 >= (query.data?.total ?? 0) || query.isFetching} onClick={() => setPage(page + 1)}>Next</Button></div></div>
    <Dialog open={detail !== null} onOpenChange={open => { if (!open) setDetail(null); }}><DialogContent><DialogHeader><DialogTitle>{detail?.reference}</DialogTitle><DialogDescription>{detail?.subject}</DialogDescription></DialogHeader><dl className="admin-detail-grid">{detail?.details.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></DialogContent></Dialog>
  </>;
}