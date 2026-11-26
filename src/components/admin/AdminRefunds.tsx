import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { downloadCsv, toCsv } from "@/lib/csv";
import { BookingInvoiceById } from "./documents/BookingInvoice";
import { ListState } from "./artists/parts";

const aed = (n: number | string | null | undefined) => `AED ${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" }) : "—");

/** Every booking where money went back to the client or was kept after a cancellation. */
export function AdminRefunds() {
  const query = useQuery({
    queryKey: ["admin-refunds"],
    queryFn: async () => {
      const r = await supabase.from("bookings").select("id, invoice_no, client_name, status, escrow_status, paid_amount, refund_amount, retained_to, cancelled_by, cancel_reason, cancelled_at, completed_at, created_at, artists(stage_name)")
        .eq("is_seed", false).or("refund_amount.gt.0,retained_to.not.is.null").order("created_at", { ascending: false }).limit(300);
      if (r.error) throw new Error("Unable to load refunds");
      return r.data ?? [];
    },
  });
  const [viewing, setViewing] = useState<string | null>(null);
  const rows = query.data ?? [];
  const reference = (r: (typeof rows)[number]) => r.invoice_no ?? `BK-${r.id.slice(0, 8).toUpperCase()}`;
  const type = (r: (typeof rows)[number]) => (Number(r.refund_amount) >= Number(r.paid_amount) ? "Full refund" : Number(r.refund_amount) > 0 ? "Part refund" : "Nothing refunded");
  const source = (r: (typeof rows)[number]) => (r.status === "cancelled" ? `Cancelled by ${r.cancelled_by ?? "—"}` : "Dispute decision");
  const kept = (r: (typeof rows)[number]) => Math.max(0, Number(r.paid_amount) - Number(r.refund_amount));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="adm-meta">{rows.length} bookings · refunded {aed(rows.reduce((n, r) => n + Number(r.refund_amount), 0))}</p>
        <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => downloadCsv("dealmaker-refunds.csv", toCsv(rows, [["Booking", reference], ["Artist", (r) => r.artists?.stage_name], ["Client", (r) => r.client_name], ["Type", type], ["Source", source], ["Paid", (r) => r.paid_amount], ["Refunded", (r) => r.refund_amount], ["Kept", kept], ["Kept by", (r) => r.retained_to], ["Reason", (r) => r.cancel_reason]]))}>Export CSV</Button>
      </div>
      <ListState pending={query.isPending} error={query.error} empty={rows.length ? null : "No refund has been recorded."}>
        <div className="admin-table-wrap"><table><thead><tr><th>Booking</th><th>Client / artist</th><th>Type</th><th className="text-end">Paid</th><th className="text-end">Refunded</th><th className="text-end">Kept</th><th>Reason</th><th>Date</th><th>View</th></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><b>{reference(r)}</b></td>
              <td>{r.client_name}<div className="admin-row-detail">{r.artists?.stage_name}</div></td>
              <td><span className={`adm-pill is-${type(r) === "Full refund" ? "expired" : "partial"}`}>{type(r)}</span><div className="admin-row-detail">{source(r)}</div></td>
              <td className="admin-money text-end">{aed(r.paid_amount)}</td><td className="admin-money text-end"><b>{aed(r.refund_amount)}</b></td>
              <td className="admin-money text-end">{aed(kept(r))}{r.retained_to && <div className="admin-row-detail">by the {r.retained_to}</div>}</td>
              <td className="max-w-[240px] break-words" dir="auto">{r.cancel_reason ?? "—"}</td><td className="whitespace-nowrap">{day(r.cancelled_at ?? r.completed_at ?? r.created_at)}</td>
              <td><Button size="icon" variant="ghost" aria-label={`View invoice ${reference(r)}`} onClick={() => setViewing(r.id)}><Eye /></Button></td>
            </tr>
          ))}
        </tbody></table></div>
      </ListState>
      {viewing && <BookingInvoiceById bookingId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
