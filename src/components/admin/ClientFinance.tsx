import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { downloadCsv, toCsv } from "@/lib/csv";
import { paymentState } from "@/lib/admin-documents";
import { BookingInvoiceById } from "./documents/BookingInvoice";
import { ListState } from "./artists/parts";

const aed = (n: number | string | null | undefined) => `AED ${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" }) : "—");

export type ClientRevenue = { user_id: string; display_name: string | null; email: string | null; paid_total: number | string; booking_count: number | string };

export function topClients(rows: ClientRevenue[], limit = 10) {
  return rows.map((r) => ({ id: r.user_id, name: r.display_name || r.email || "Client", revenue: Number(r.paid_total), bookings: Number(r.booking_count) }))
    .filter((r) => r.revenue > 0).sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name)).slice(0, limit);
}

/** The ten clients who have paid the most for bookings. */
export function TopClientsChart() {
  const query = useQuery({
    queryKey: ["admin-client-accounts"],
    queryFn: async () => {
      const r = await supabase.rpc("admin_client_accounts");
      if (r.error) throw new Error("Unable to load client accounts");
      return r.data ?? [];
    },
  });
  const data = topClients(query.data ?? []);
  return (
    <section className="admin-overview-panel" aria-labelledby="top-clients-title">
      <header><div><h2 id="top-clients-title">Top 10 clients by revenue</h2><p>Money each client has paid for bookings, highest first</p></div><span className="admin-overview-badge">{data.length} clients</span></header>
      <ListState pending={query.isPending} error={query.error} empty={data.length ? null : "No client has paid a booking yet."}>
        <div className="h-72 w-full" role="img" aria-label={`Revenue by client: ${data.map((d) => `${d.name} ${aed(d.revenue)}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 24, bottom: 0, left: 4 }}>
              <defs><linearGradient id="topClientFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--gold)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--gold)" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} padding={{ left: 20, right: 20 }} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v: string) => (v.length > 11 ? `${v.slice(0, 10)}…` : v)} />
              <YAxis width={52} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={compact} />
              <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--popover-foreground)" }} labelStyle={{ color: "var(--popover-foreground)" }} itemStyle={{ color: "var(--popover-foreground)" }} formatter={(value) => [aed(value as number), "Revenue"]} />
              <Area type="monotone" dataKey="revenue" stroke="var(--gold)" strokeWidth={2} fill="url(#topClientFill)" dot={{ r: 4, fill: "var(--gold)", stroke: "var(--card)", strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted-foreground">Show as table</summary>
          <div className="admin-table-wrap mt-3"><table><thead><tr><th>Rank</th><th>Client</th><th>Bookings</th><th className="text-end">Revenue</th></tr></thead><tbody>{data.map((d, i) => <tr key={d.id}><td>{i + 1}</td><td>{d.name}</td><td>{d.bookings}</td><td className="admin-money text-end">{aed(d.revenue)}</td></tr>)}</tbody></table></div>
        </details>
      </ListState>
    </section>
  );
}

/** Every booking that earns a client commission, with the platform's share of it. */
export function ClientCommissionTransactions() {
  const query = useQuery({
    queryKey: ["admin-client-commissions"],
    queryFn: async () => {
      const r = await supabase.rpc("admin_client_commissions");
      if (r.error) throw new Error("Unable to load commission transactions");
      return r.data ?? [];
    },
  });
  const [viewing, setViewing] = useState<string | null>(null);
  const rows = query.data ?? [];
  const total = (key: "paid_amount" | "fee" | "commission" | "revenue") => rows.reduce((n, r) => n + Math.round(Number(r[key]) * 100), 0) / 100;
  return (
    <section className="space-y-3" aria-labelledby="commission-tx-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 id="commission-tx-title" className="font-display text-3xl">Client commission transactions</h2><p className="adm-meta">Platform revenue is the platform fee minus the client's commission.</p></div>
        <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => downloadCsv("dealmaker-client-commissions.csv", toCsv(rows, [["Date", (r) => day(r.happened_at)], ["Booking", (r) => r.reference], ["Artist", (r) => r.artist_name], ["Client", (r) => r.client_name], ["Job", (r) => r.job], ["Payment status", (r) => paymentState(Number(r.total), Number(r.paid_amount), r.job_status)], ["Job status", (r) => r.job_status], ["Total payment", (r) => r.paid_amount], ["Platform fee", (r) => r.fee], ["Commission", (r) => r.commission], ["Platform revenue", (r) => r.revenue], ["Commission status", (r) => r.commission_status]]))}>Export CSV</Button>
      </div>
      <ListState pending={query.isPending} error={query.error} empty={rows.length ? null : "No booking has earned a client commission yet."}>
        <div className="admin-table-wrap"><table><thead><tr><th>Date</th><th>Artist</th><th>Job</th><th>Payment status</th><th>Job status</th><th className="text-end">Total payment</th><th className="text-end">Platform fee</th><th className="text-end">Commission</th><th className="text-end">Platform revenue</th><th>View</th></tr></thead><tbody>
          {rows.map((r) => { const state = paymentState(Number(r.total), Number(r.paid_amount), r.job_status); return (
            <tr key={r.booking_id}>
              <td className="whitespace-nowrap">{day(r.happened_at)}</td>
              <td><b>{r.artist_name}</b></td>
              <td>{r.job}<div className="admin-row-detail">{r.reference} · {r.client_name}</div></td>
              <td><span className={`adm-pill is-${state}`}>{state}</span></td>
              <td>{r.job_status}</td>
              <td className="admin-money text-end">{aed(r.paid_amount)}</td>
              <td className="admin-money text-end">{aed(r.fee)}</td>
              <td className="admin-money text-end">{aed(r.commission)}<div className="admin-row-detail">{Number(r.rate)}% · {r.commission_status}</div></td>
              <td className="admin-money text-end"><b>{aed(r.revenue)}</b></td>
              <td><Button size="icon" variant="ghost" aria-label={`View invoice ${r.reference}`} onClick={() => setViewing(r.booking_id)}><Eye /></Button></td>
            </tr>
          ); })}
        </tbody><tfoot><tr><td colSpan={5}><b>Total</b></td><td className="admin-money text-end"><b>{aed(total("paid_amount"))}</b></td><td className="admin-money text-end"><b>{aed(total("fee"))}</b></td><td className="admin-money text-end"><b>{aed(total("commission"))}</b></td><td className="admin-money text-end"><b>{aed(total("revenue"))}</b></td><td /></tr></tfoot></table></div>
      </ListState>
      {viewing && <BookingInvoiceById bookingId={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
