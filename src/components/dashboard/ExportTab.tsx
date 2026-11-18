import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toCsv, downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";

const today = () => new Date().toISOString().slice(0, 10);

export function ExportTab({ artistId, slug }: { artistId: string; slug: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (name: string, fn: () => Promise<string>) => {
    setBusy(name);
    try { downloadCsv(`dealmaker-${slug}-${name}-${today()}.csv`, await fn()); toast.success("Download started"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Export failed"); }
    finally { setBusy(null); }
  };
  const items = [
    { name: "bookings", label: "Bookings & invoices", desc: "Every booking with VAT, totals, refunds and invoice numbers.", fn: async () => {
      const { data, error } = await supabase.from("bookings").select("invoice_no, client_name, package_title, event_date, status, escrow_status, amount, vat_amount, total, paid_amount, refund_amount, paid_at, completed_at, cancelled_at, created_at").eq("artist_id", artistId).eq("is_seed", false).order("created_at", { ascending: false });
      if (error) throw error;
      return toCsv(data ?? [], [["Invoice", (r) => r.invoice_no], ["Client", (r) => r.client_name], ["Package", (r) => r.package_title], ["Event date", (r) => r.event_date], ["Status", (r) => r.status], ["Escrow", (r) => r.escrow_status], ["Amount (AED)", (r) => r.amount], ["VAT (AED)", (r) => r.vat_amount], ["Total (AED)", (r) => r.total], ["Paid (AED)", (r) => r.paid_amount], ["Refunded (AED)", (r) => r.refund_amount], ["Paid at", (r) => r.paid_at], ["Completed at", (r) => r.completed_at], ["Cancelled at", (r) => r.cancelled_at], ["Created", (r) => r.created_at]]);
    } },
    { name: "quotes", label: "Quote requests", desc: "Leads from the Free Quick Quote form.", fn: async () => {
      const { data, error } = await supabase.from("quote_requests").select("name, event_date, guests, budget, status, message, created_at").eq("artist_id", artistId).order("created_at", { ascending: false });
      if (error) throw error;
      return toCsv(data ?? [], [["Name", (r) => r.name], ["Event date", (r) => r.event_date], ["Guests", (r) => r.guests], ["Budget (AED)", (r) => r.budget], ["Status", (r) => r.status], ["Message", (r) => r.message], ["Created", (r) => r.created_at]]);
    } },
    { name: "credits", label: "AI credit history", desc: "Every credit top-up and AI reply charge.", fn: async () => {
      const { data, error } = await supabase.from("credit_ledger").select("created_at, delta, reason, ref").eq("artist_id", artistId).order("created_at", { ascending: false });
      if (error) throw error;
      return toCsv(data ?? [], [["Date", (r) => r.created_at], ["Change", (r) => r.delta], ["Reason", (r) => r.reason], ["Reference", (r) => r.ref]]);
    } },
  ];
  return (
    <div className="mt-6 grid gap-3 md:grid-cols-3">
      {items.map((it) => (
        <div key={it.name} className="flex flex-col rounded-xl bg-card p-4 shadow-card">
          <div className="font-semibold">{it.label}</div>
          <p className="mt-1 flex-1 text-sm text-muted-foreground">{it.desc}</p>
          <Button className="mt-4" variant="outline" disabled={busy !== null} onClick={() => run(it.name, it.fn)}>
            <Download className="mr-2 h-4 w-4" />{busy === it.name ? "Preparing…" : "Download CSV"}
          </Button>
        </div>
      ))}
    </div>
  );
}
