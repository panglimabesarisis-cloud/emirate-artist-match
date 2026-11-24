import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAdminSnapshot } from "@/lib/admin-control.functions";
import { Button } from "@/components/ui/button";
import { formatAED } from "./util";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function AdminOverview({ onOpen }: { onOpen?: (section: "requests" | "verify" | "payouts" | "client-payouts") => void }) {
  const fetchSummary = useServerFn(getAdminSnapshot);
  const query = useQuery({ queryKey: ["admin-overview"], queryFn: () => fetchSummary(), staleTime: 30_000 });
  const data = query.data;
  const months = data?.months ?? [];
  const cats = data?.categories ?? [];
  const plans = data?.plans ?? [];
  const statuses = data?.statuses ?? [];
  const kpis = [
    { label: "Collected payments", value: data ? formatAED(data.collected) : "…", sub: "VAT included · demo payments" },
    { label: "Funds held", value: data ? formatAED(data.held) : "…", sub: "After recorded refunds" },
    { label: "Active artists", value: data ? String(data.activeArtists) : "…", sub: `${data?.pendingArtists ?? 0} awaiting approval` },
    { label: "Bookings", value: data ? String(data.bookings) : "…", sub: data ? `${formatAED(data.refunded)} refunded` : "Loading summary" },
  ];
  if (query.error) return <p role="alert">Unable to load overview. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></p>;

  return (
    <div className="space-y-6">
      <div className="admin-queues">
        <Button variant="outline" onClick={() => onOpen?.("requests")}>Artist requests <b>{data?.pendingArtists ?? "…"}</b></Button>
        <Button variant="outline" onClick={() => onOpen?.("verify")}>Verification <b>{data?.pendingVerification ?? "…"}</b></Button>
        <Button variant="outline" onClick={() => onOpen?.("payouts")}>Artist payouts <b>{data?.pendingArtistPayouts ?? "…"}</b></Button>
        <Button variant="outline" onClick={() => onOpen?.("client-payouts")}>Client payouts <b>{data?.pendingClientPayouts ?? "…"}</b></Button>
      </div>
      <div className="admin-metrics">
        {kpis.map((k) => (
          <div key={k.label} className="admin-metric">
            <small>{k.label}</small>
            <strong>{k.value}</strong>
            <small>{k.sub}</small>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Collected payments · six months" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="m" fontSize={12} /><YAxis fontSize={12} />
              <Tooltip />
              <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.12} name="Collected (AED)" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Booking status">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={statuses} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                {statuses.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <Legend items={statuses} />
        </Panel>
        <Panel title="Quotes vs bookings">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="m" fontSize={12} /><YAxis fontSize={12} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="quotes" fill="var(--chart-2)" name="Quotes" />
              <Bar dataKey="bookings" fill="var(--chart-1)" name="Bookings" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Artists by category">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cats} layout="vertical">
              <XAxis type="number" fontSize={12} allowDecimals={false} /><YAxis type="category" dataKey="name" width={90} fontSize={11} />
              <Tooltip />
              <Bar dataKey="value" fill="var(--chart-3)" name="Artists" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Artists by plan">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={plans} dataKey="value" nameKey="name" outerRadius={75}>
                {plans.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <Legend items={plans} offset={2} />
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={`admin-chart-section ${className}`}><h2>{title}</h2>{children}</section>;
}
function Legend({ items, offset = 0 }: { items: { name: string; value: number }[]; offset?: number }) {
  return <div className="mt-2 flex flex-wrap gap-3 text-xs">{items.map((s, i) => <span key={s.name} className="flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: COLORS[(i + offset) % COLORS.length] }} />{s.name} ({s.value})</span>)}</div>;
}
