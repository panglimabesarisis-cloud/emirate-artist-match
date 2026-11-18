import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatAED } from "./util";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function AdminOverview() {
  const { data } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const [b, a, q] = await Promise.all([
        supabase.from("bookings").select("total, amount, status, escrow_status, created_at, event_date, conversation_id"),
        supabase.from("artists").select("status, plan, categories(name)"),
        supabase.from("quote_requests").select("created_at"),
      ]);
      return { bookings: b.data ?? [], artists: a.data ?? [], quotes: q.data ?? [] };
    },
  });
  const bookings = (data?.bookings ?? []).map((b) => ({ ...b, total: Number(b.total) || Number(b.amount) * 1.05 }));
  const artists = data?.artists ?? [];
  const paid = bookings.filter((x) => ["paid", "confirmed", "completed"].includes(x.status) || x.escrow_status === "held" || x.escrow_status === "released");
  const gmv = paid.reduce((s, x) => s + Number(x.total || 0), 0);
  const escrow = bookings.filter((x) => x.escrow_status === "held").reduce((s, x) => s + Number(x.total || 0), 0);
  const active = artists.filter((x) => x.status === "approved").length;
  const pending = artists.filter((x) => x.status === "pending").length;
  const fromQuotes = bookings.filter((b) => b.conversation_id).length;
  const conv = data?.quotes.length ? Math.min(100, Math.round((fromQuotes / data.quotes.length) * 100)) : 0;

  const months: { m: string; bookings: number; revenue: number; quotes: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ m: d.toLocaleString("en", { month: "short" }), bookings: 0, revenue: 0, quotes: 0 });
  }
  const idx = (iso: string) => {
    const d = new Date(iso);
    const diff = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
    return diff >= 0 && diff < 6 ? 5 - diff : -1;
  };
  bookings.forEach((b) => { const i = idx(b.created_at); const m = months[i]; if (m) { m.bookings++; m.revenue += Number(b.total || 0); } });
  data?.quotes.forEach((q) => { const i = idx(q.created_at); const m = months[i]; if (m) m.quotes++; });

  const catMap = new Map<string, number>();
  artists.filter((a) => a.status === "approved").forEach((a) => { const n = a.categories?.name ?? "Other"; catMap.set(n, (catMap.get(n) ?? 0) + 1); });
  const cats = [...catMap].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const planMap = new Map<string, number>();
  artists.forEach((a) => planMap.set(a.plan, (planMap.get(a.plan) ?? 0) + 1));
  const plans = [...planMap].map(([name, value]) => ({ name, value }));
  const statusMap = new Map<string, number>();
  bookings.forEach((b) => statusMap.set(b.status, (statusMap.get(b.status) ?? 0) + 1));
  const statuses = [...statusMap].map(([name, value]) => ({ name, value }));

  const kpis = [
    { label: "Total GMV", value: formatAED(gmv) },
    { label: "In escrow", value: formatAED(escrow) },
    { label: "Active artists", value: String(active), sub: `${pending} pending` },
    { label: "Bookings", value: String(bookings.length), sub: `${data?.quotes.length ?? 0} quotes` },
    { label: "Quote → booking", value: `${conv}%` },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className="mt-1 text-2xl font-semibold">{k.value}</div>
            {k.sub && <div className="text-xs text-muted-foreground">{k.sub}</div>}
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Revenue & bookings (6 months)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="m" fontSize={12} /><YAxis fontSize={12} />
              <Tooltip />
              <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.25} name="Revenue (AED)" />
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
  return <div className={`rounded-xl border bg-card p-4 ${className}`}><h3 className="mb-3 text-sm font-semibold">{title}</h3>{children}</div>;
}
function Legend({ items, offset = 0 }: { items: { name: string; value: number }[]; offset?: number }) {
  return <div className="mt-2 flex flex-wrap gap-3 text-xs">{items.map((s, i) => <span key={s.name} className="flex items-center gap-1"><span className="size-2.5 rounded-full" style={{ background: COLORS[(i + offset) % COLORS.length] }} />{s.name} ({s.value})</span>)}</div>;
}
