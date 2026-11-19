import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CONTRACT_TERMS } from "@/lib/booking-rules";
import { invoiceMoney } from "@/lib/invoice";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  return <section className="space-y-4"><div className="flex flex-wrap gap-3"><Input className="max-w-xs" aria-label={t("Search contracts")} placeholder={t("Search contracts")} value={search} onChange={e=>setSearch(e.target.value)}/><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-48" aria-label={t("Acceptance status")}><SelectValue/></SelectTrigger><SelectContent>{[["all","All contracts"],["accepted","Accepted"],["pending","Awaiting acceptance"]].map(([value,label])=><SelectItem key={value} value={value ?? "all"}>{t(label ?? "")}</SelectItem>)}</SelectContent></Select></div>
    {error ? <p role="alert" className="text-destructive">{t("Could not load contracts.")}</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b bg-muted"><tr>{["Booking",...(!artistId?["Artist"]:[]),"Client","Date","Total","Contract","Accepted at","View"].map(h=><th key={h} className="p-3 text-start whitespace-nowrap">{t(h)}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-b"><td className="p-3">{row.package_title ?? row.invoice_no ?? row.id.slice(0,8)}</td>{!artistId && <td className="p-3">{row.artists?.stage_name}</td>}<td className="p-3">{row.client_name}</td><td className="p-3 whitespace-nowrap">{row.event_date}</td><td className="p-3 whitespace-nowrap">{invoiceMoney(Number(row.total))}</td><td className="p-3"><Badge variant={row.contract_accepted_at ? "default" : "secondary"}>{t(row.contract_accepted_at ? "Accepted" : "Awaiting acceptance")}</Badge></td><td className="p-3 whitespace-nowrap">{row.contract_accepted_at ? new Date(row.contract_accepted_at).toLocaleString("en-GB") : "—"}</td><td className="p-3"><Button size="icon" variant="ghost" title={t("Contract preview")} aria-label={`View contract ${row.client_name}`} onClick={()=>setSelected(row.id)}><Eye className="size-4"/></Button></td></tr>)}{!rows.length && <tr><td colSpan={artistId?7:8} className="p-8 text-center text-muted-foreground">{t(isPending ? "Loading…" : "No contracts yet.")}</td></tr>}</tbody></table></div>}
    <Dialog open={!!contract} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t("Booking contract")} · Dealmaker</DialogTitle></DialogHeader>{contract && <div className="space-y-5 text-sm"><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 border-y py-4">{[["Artist",contract.artists?.stage_name],["Client",contract.client_name],["Service",contract.package_title],["Date",contract.event_date],["Time",`${contract.start_time?.slice(0,5) ?? "—"} – ${contract.end_time?.slice(0,5) ?? "—"}`],["Total",invoiceMoney(Number(contract.total))],["Booking status",contract.status]].map(([label,value])=><div key={label} className="contents"><dt className="text-muted-foreground">{t(label ?? "")}</dt><dd className="break-words font-medium">{value ?? "—"}</dd></div>)}</dl><p className="whitespace-pre-wrap break-words">{contract.job_detail ?? contract.notes}</p><ol className="list-decimal space-y-3 ps-5">{CONTRACT_TERMS.map(term=><li key={term}>{t(term)}</li>)}</ol><p className="border-t pt-4 text-muted-foreground">{contract.contract_accepted_at ? `${t("Accepted at")} ${new Date(contract.contract_accepted_at).toLocaleString("en-GB")}` : t("Awaiting acceptance")}</p></div>}</DialogContent></Dialog>
  </section>;
}