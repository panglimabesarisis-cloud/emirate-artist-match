import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invoiceMoney, type Invoice } from "@/lib/invoice";
import { bookingPayment } from "@/lib/booking-payment-rules";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InvoiceCard } from "@/components/site/InvoiceCard";

export function InvoiceRecords({ artistId }: { artistId?: string }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const { data = [], isPending, error } = useQuery({
    queryKey: ["invoice-records", artistId], refetchInterval: 5000,
    queryFn: async () => {
      let query = supabase.from("service_invoices").select("id, number, document, total, status, paid_at, conversation_id, artists(stage_name), bookings(client_name, total, paid_amount, deposit_pct), conversations(quote_requests(name))").order("created_at", { ascending: false });
      if (artistId) query = query.eq("artist_id", artistId);
      const result = await query;
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  });
  const rows = data.map(row => {
    const paid = row.bookings ? Math.min(Number(row.total), Number(row.bookings.paid_amount)) : row.status === "paid" ? Number(row.total) : 0;
    const percent = bookingPayment(Number(row.total), paid, 100).percent;
    return { ...row, paid, percent, client: row.bookings?.client_name ?? row.conversations?.quote_requests?.name ?? `Direct chat · ${row.conversation_id.slice(0, 8)}` };
  });
  const previewStatus = data.find(row => row.id === previewId)?.status;
  const filtered = rows.filter(row => `${row.number} ${row.client} ${row.artists?.stage_name}`.toLowerCase().includes(search.toLowerCase()) && (status === "all" || (status === "paid" ? row.status === "paid" : status === "partial" ? row.paid > 0 && row.status !== "paid" : row.paid === 0)));
  return <section className="space-y-4 studio-invoice-records">
    {!artistId && <div className="grid gap-4 border-b pb-5 sm:grid-cols-3">{[["Total invoiced", rows.reduce((s,r)=>s+Number(r.total),0)], ["Total paid", rows.reduce((s,r)=>s+r.paid,0)], ["Outstanding balance", rows.reduce((s,r)=>s+Math.max(0,Number(r.total)-r.paid),0)]].map(([label,value])=><div key={label}><p className="text-sm text-muted-foreground">{t(String(label))}</p><p className="mt-1 text-xl font-semibold">{invoiceMoney(Number(value))}</p></div>)}</div>}
    <div className="dmr-q-tools"><Input aria-label={t("Search invoices")} placeholder={t("Search invoices")} className="max-w-xs" value={search} onChange={e=>setSearch(e.target.value)}/><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44" aria-label={t("Payment status")}><SelectValue/></SelectTrigger><SelectContent>{[["all","All payments"],["unpaid","Unpaid"],["partial","Partially paid"],["paid","Paid 100%"]].map(([value,label])=><SelectItem key={value} value={value ?? "all"}>{t(label ?? "")}</SelectItem>)}</SelectContent></Select></div>
    {error ? <p role="alert" className="text-destructive">{t("Could not load invoices.")}</p> : <div className="dmr-tbl-wrap"><table className="w-full text-sm"><thead className="border-b bg-muted"><tr>{["Invoice", ...(!artistId ? ["Artist"] : []), "Client", "Total", "Payment", "Balance", "Paid at", "View"].map(h=><th key={h} className="p-3 text-start whitespace-nowrap">{t(h)}</th>)}</tr></thead><tbody>{filtered.map(row=><tr key={row.id} className="border-b"><td className="p-3 whitespace-nowrap">{row.number}</td>{!artistId && <td className="p-3">{row.artists?.stage_name}</td>}<td className="p-3">{row.client}</td><td className="p-3 whitespace-nowrap">{invoiceMoney(Number(row.total))}</td><td className="p-3 whitespace-nowrap"><Badge variant={row.status === "paid" ? "default" : "secondary"}>{row.status === "paid" ? t("Paid 100%") : row.paid > 0 ? `${t("Paid")} ${row.percent}%` : t("Unpaid")}</Badge></td><td className="p-3 whitespace-nowrap">{invoiceMoney(Math.max(0,Number(row.total)-row.paid))}</td><td className="p-3 whitespace-nowrap">{row.paid_at ? new Date(row.paid_at).toLocaleString("en-GB") : "—"}</td><td className="p-3"><Button size="icon" variant="ghost" title={t("Invoice preview")} aria-label={`View ${row.number}`} onClick={()=>{setPreview(row.document as unknown as Invoice);setPreviewId(row.id);}}><Eye className="size-4"/></Button></td></tr>)}{!filtered.length && <tr><td colSpan={artistId ? 7 : 8} className="p-8 text-center text-muted-foreground">{t(isPending ? "Loading…" : "No invoices yet.")}</td></tr>}</tbody></table></div>}
    <Dialog open={!!preview} onOpenChange={open=>{if(!open)setPreview(null);}}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{t("Invoice preview")}</DialogTitle></DialogHeader>{preview && <InvoiceCard inv={preview} status={previewStatus}/>}</DialogContent></Dialog>
  </section>;
}