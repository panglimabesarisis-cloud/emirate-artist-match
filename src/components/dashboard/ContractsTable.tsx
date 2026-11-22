import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, FileSignature, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CONTRACT_TERMS } from "@/lib/booking-rules";
import { invoiceMoney } from "@/lib/invoice";
import { useI18n } from "@/lib/i18n";
import { StudioHeading, StudioSection, StudioSoon } from "./StudioPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ContractRow = { id: string; client_name: string; package_title: string | null; event_date: string | null; total: number | string; contract_accepted_at: string | null; invoice_no: string | null };
const fmtD = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const kh = "whitespace-nowrap border-b border-border bg-card px-3.5 py-3 text-[11px] font-extrabold uppercase tracking-[.1em] text-muted-foreground";
const kc = "whitespace-nowrap border-b border-border px-3.5 py-3.5 align-middle";

/** Artist view of booking contracts, laid out as in the design reference. */
function ArtistContractsPanel({ rows, isPending, error, onView }: { rows: ContractRow[]; isPending: boolean; error: unknown; onView: (id: string) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "awaiting" | "accepted">("all");
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(0);
  const accepted = rows.filter((r) => r.contract_accepted_at).length;
  const counts = { all: rows.length, awaiting: rows.length - accepted, accepted };
  const needle = q.trim().toLowerCase();
  const list = rows.filter((r) => (tab === "all" || (tab === "accepted") === !!r.contract_accepted_at) && (!needle || `${r.package_title ?? ""} ${r.client_name}`.toLowerCase().includes(needle)));
  const pages = Math.max(1, Math.ceil(list.length / size));
  const cur = Math.min(page, pages - 1);
  const shown = list.slice(cur * size, cur * size + size);
  return (
    <section className="dmr-panel dmr-q-panel dmr-c-12" aria-label={t("Booking contracts")}>
      <div className="dmr-q-tools">
        <div className="me-auto"><h2 className="font-display text-[28px] leading-none">{t("Booking contracts")}</h2><small className="text-xs text-muted-foreground">{t("One per booking")}</small></div>
        <label className="relative flex max-w-md flex-1 basis-64 items-center">
          <Search className="pointer-events-none absolute start-3.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="sr-only">{t("Search contracts")}</span>
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={t("Search booking or client")} className="h-10 w-full rounded-full border border-border bg-foreground/[.04] pe-4 ps-10 text-sm outline-none focus-visible:border-gold" />
        </label>
        <div className="flex gap-0.5 rounded-xl bg-foreground/[.04] p-[3px]" role="group" aria-label={t("Filter by contract status")}>
          {([["all", "All contracts"], ["awaiting", "Awaiting"], ["accepted", "Accepted"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => { setTab(k); setPage(0); }} className={`rounded-[10px] px-3.5 py-1.5 text-[13px] font-semibold ${tab === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{t(l)} <span className="opacity-60">{counts[k]}</span></button>)}
        </div>
      </div>
      {error ? <p role="alert" className="p-5 text-destructive">{t("Could not load contracts.")}</p> : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-[13.5px]">
            <thead><tr>{["Booking", "Client", "Date", "Total", "Contract", "Accepted at"].map((h) => <th key={h} scope="col" className={`${kh} ${h === "Total" ? "text-end" : "text-start"}`}>{t(h)}</th>)}<th scope="col" className={`${kh} text-end`}>{t("View")}</th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-muted-foreground"><b className="block font-display text-2xl">{isPending ? t("Loading…") : t("No contracts found")}</b>{!isPending && t("Try another word or status.")}</td></tr>}
              {shown.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-foreground/[.03]">
                  <td className={kc}><b>{r.package_title ?? r.invoice_no ?? r.id.slice(0, 8)}</b></td>
                  <td className={kc}>{r.client_name}</td>
                  <td className={kc}><b>{fmtD(r.event_date)}</b></td>
                  <td className={`${kc} text-end`} dir="ltr"><b>{invoiceMoney(Number(r.total))}</b></td>
                  <td className={kc}><span className={`inline-flex h-6 min-w-[120px] items-center justify-center rounded-full px-2.5 text-[10.5px] font-extrabold ${r.contract_accepted_at ? "border border-emerald-400/35 bg-emerald-400/15 text-emerald-300" : "bg-gradient-gold text-gold-foreground"}`}>{t(r.contract_accepted_at ? "Accepted" : "Awaiting acceptance")}</span></td>
                  <td className={kc}>{r.contract_accepted_at ? new Date(r.contract_accepted_at).toLocaleString("en-GB") : <span className="text-muted-foreground/60">{t("Not yet")}</span>}</td>
                  <td className={`${kc} text-end`}><Button size="icon" variant="ghost" title={t("Contract preview")} aria-label={`${t("View contract for")} ${r.client_name}`} onClick={() => onView(r.id)}><Eye className="size-4" /></Button></td>
                </tr>
              ))}
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
    </section>
  );
}

export function ContractsTable({ artistId }: { artistId?: string }) {
  const { t } = useI18n();
  const [search,setSearch] = useState("");
  const [status,setStatus] = useState("all");
  const [selected,setSelected] = useState<string | null>(null);
  const { data = [], isPending, error } = useQuery({queryKey:["contracts",artistId],queryFn:async()=>{
    let query = supabase.from("bookings").select("id, client_name, package_title, event_date, start_time, end_time, job_detail, notes, total, contract_accepted_at, status, invoice_no, artists(stage_name)").in("status",["quoted","confirmed","completed","cancelled","disputed"]).order("created_at",{ascending:false});
    if(artistId)query=query.eq("artist_id",artistId);
    const result=await query; if(result.error)throw result.error; return result.data ?? [];
  }});
  const rows=data.filter(row=>`${row.client_name} ${row.artists?.stage_name} ${row.package_title}`.toLowerCase().includes(search.toLowerCase()) && (status === "all" || (status === "accepted" ? !!row.contract_accepted_at : !row.contract_accepted_at)));
  const contract=data.find(row=>row.id===selected);
  return <section className="dmr-wrap dmr-kpage"><StudioHeading title="Contr" accent="acts"><div className="dmr-q-stats"><div className="dmr-qs"><small>{t("Awaiting")}</small><b>{data.filter(row=>!row.contract_accepted_at).length}</b></div><div className="dmr-qs"><small>{t("Accepted")}</small><b>{data.filter(row=>row.contract_accepted_at).length}</b></div></div></StudioHeading>{artistId ? <ArtistContractsPanel rows={data as unknown as ContractRow[]} isPending={isPending} error={error} onView={setSelected} /> : (<div className="dmr-panel dmr-q-panel dmr-c-12"><div className="dmr-q-tools"><h2>{t("Booking contracts")}</h2><Input className="max-w-xs" aria-label={t("Search contracts")} placeholder={t("Search contracts")} value={search} onChange={e=>setSearch(e.target.value)}/><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-48" aria-label={t("Acceptance status")}><SelectValue/></SelectTrigger><SelectContent>{[["all","All contracts"],["accepted","Accepted"],["pending","Awaiting acceptance"]].map(([value,label])=><SelectItem key={value} value={value ?? "all"}>{t(label ?? "")}</SelectItem>)}</SelectContent></Select></div>
    {error ? <p role="alert" className="text-destructive">{t("Could not load contracts.")}</p> : <div className="dmr-tbl-wrap"><table className="w-full text-sm" data-studio-table="true"><thead className="border-b bg-muted"><tr>{["Booking",...(!artistId?["Artist"]:[]),"Client","Date","Total","Contract","Accepted at","View"].map(h=><th key={h} className="p-3 text-start whitespace-nowrap">{t(h)}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-b"><td className="p-3" data-label={t("Booking")}>{row.package_title ?? row.invoice_no ?? row.id.slice(0,8)}</td>{!artistId && <td className="p-3" data-label={t("Artist")}>{row.artists?.stage_name}</td>}<td className="p-3" data-label={t("Client")}>{row.client_name}</td><td className="p-3 whitespace-nowrap" data-label={t("Date")}>{row.event_date}</td><td className="p-3 whitespace-nowrap" data-label={t("Total")}>{invoiceMoney(Number(row.total))}</td><td className="p-3" data-label={t("Contract")}><Badge variant={row.contract_accepted_at ? "default" : "secondary"}>{t(row.contract_accepted_at ? "Accepted" : "Awaiting acceptance")}</Badge></td><td className="p-3 whitespace-nowrap" data-label={t("Accepted at")}>{row.contract_accepted_at ? new Date(row.contract_accepted_at).toLocaleString("en-GB") : "—"}</td><td className="p-3" data-label={t("View")}><Button size="icon" variant="ghost" title={t("Contract preview")} aria-label={`View contract ${row.client_name}`} onClick={()=>setSelected(row.id)}><Eye className="size-4"/></Button></td></tr>)}{!rows.length && <tr><td colSpan={artistId?7:8} className="p-8 text-center text-muted-foreground">{t(isPending ? "Loading…" : "No contracts yet.")}</td></tr>}</tbody></table></div>}
    </div>)}<StudioSection title="Contract" accent="templates" className="dmr-c-12"><div className="flex flex-wrap items-center justify-between gap-4"><Input className="min-w-0 flex-1" disabled aria-label={t("Search templates")} placeholder={t("Search templates")} /><Button disabled>{t("New template")} · {t("segera")}</Button></div><div className="studio-template-disabled">{["Performers","Hosts and speakers","Models and creators"].map(label=><div key={label}><FileSignature className="size-7 text-gold" /><h3 className="mt-4">{t(label)}</h3><StudioSoon label="Contract template" /></div>)}</div></StudioSection>
    <Dialog open={!!contract} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t("Booking contract")} {t("· Dealmaker")}</DialogTitle></DialogHeader>{contract && <div className="space-y-5 text-sm"><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 border-y py-4">{[["Artist",contract.artists?.stage_name],["Client",contract.client_name],["Service",contract.package_title],["Date",contract.event_date],["Time",`${contract.start_time?.slice(0,5) ?? "—"} – ${contract.end_time?.slice(0,5) ?? "—"}`],["Total",invoiceMoney(Number(contract.total))],["Booking status",contract.status]].map(([label,value])=><div key={label} className="contents"><dt className="text-muted-foreground">{t(label ?? "")}</dt><dd className="break-words font-medium">{value ?? "—"}</dd></div>)}</dl><p className="whitespace-pre-wrap break-words">{contract.job_detail ?? contract.notes}</p><ol className="list-decimal space-y-3 ps-5">{CONTRACT_TERMS.map(term=><li key={term}>{t(term)}</li>)}</ol><p className="border-t pt-4 text-muted-foreground">{contract.contract_accepted_at ? `${t("Accepted at")} ${new Date(contract.contract_accepted_at).toLocaleString("en-GB")}` : t("Awaiting acceptance")}</p></div>}</DialogContent></Dialog>
  </section>;
}