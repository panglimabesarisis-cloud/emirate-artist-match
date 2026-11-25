import { useQuery } from "@tanstack/react-query";
import { Activity, Coins, Cpu, PlusCircle, Users, Wallet } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCsv, toCsv } from "@/lib/csv";
import { Distribution, Panel } from "./AdminOverview";
import { AdminRecords } from "./AdminRecords";

type Named = { name: string; used: number; charges: number; tokens?: number };
export type CreditUsage = {
  from: string; to: string;
  totals: { used: number; added: number; charges: number; tokens: number; artists: number; balance: number };
  daily: { date: string; used: number; added: number }[]; artists: Named[]; models: Named[]; tasks: Named[];
};
const credits = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const short = (date: string, monthly: boolean) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", monthly ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });

/** Daily figures, summed into weeks for a quarter and into months for a year so the bars stay readable. */
export function creditBuckets(daily: CreditUsage["daily"]) {
  const monthly = daily.length > 120, weekly = !monthly && daily.length > 45;
  const out: { label: string; used: number; added: number }[] = [];
  let key = "";
  daily.forEach((day, i) => {
    const next = monthly ? day.date.slice(0, 7) : weekly ? String(Math.floor(i / 7)) : day.date;
    if (next !== key) { key = next; out.push({ label: short(day.date, monthly), used: 0, added: 0 }); }
    const last = out[out.length - 1]!;
    last.used = Math.round((last.used + Number(day.used)) * 1000) / 1000;
    last.added = Math.round((last.added + Number(day.added)) * 1000) / 1000;
  });
  return { rows: out, unit: monthly ? "month" : weekly ? "week" : "day" };
}

export function AdminCredits() {
  const [days, setDays] = useState("30");
  const query = useQuery({
    queryKey: ["admin-credit-usage", days],
    queryFn: async () => {
      const r = await supabase.rpc("admin_credit_usage", { _days: Number(days) });
      if (r.error) throw new Error("Unable to load credit statistics");
      return r.data as unknown as CreditUsage;
    },
  });
  const data = query.data;
  const buckets = creditBuckets(data?.daily ?? []);
  const value = (n: number | undefined) => (data ? credits(n ?? 0) : "…");
  const kpis = [
    { label: "Credits used", value: value(data?.totals.used), sub: "Charged in this period", icon: Activity },
    { label: "Credits added", value: value(data?.totals.added), sub: "Plan allowances, top-ups and grants", icon: PlusCircle },
    { label: "AI charges", value: value(data?.totals.charges), sub: "Ledger entries that used credits", icon: Coins },
    { label: "Tokens processed", value: value(data?.totals.tokens), sub: "Input and output tokens recorded", icon: Cpu },
    { label: "Artists using AI", value: value(data?.totals.artists), sub: "Artists with a charge in this period", icon: Users },
    { label: "Balance in wallets", value: value(data?.totals.balance), sub: "Credits all artists hold now", icon: Wallet },
  ];
  const share = (items: Named[] | undefined) => (items ?? []).map((x) => ({ name: x.name, value: Number(x.used) }));
  const total = Number(data?.totals.used ?? 0);
  if (query.error) return <><div role="alert" className="admin-overview-error">Unable to load credit statistics. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div><AdminRecords kind="credits" /></>;
  return (
    <div className="admin-overview" aria-busy={query.isPending}>
      <div className="admin-overview-toolbar">
        <span>AI credit usage <span className="admin-overview-muted">· {data ? `${short(data.from, false)} to ${short(data.to, false)}` : "Loading…"}</span></span>
        <div className="flex flex-wrap gap-2">
          <Select value={days} onValueChange={setDays}><SelectTrigger className="admin-overview-period" aria-label="Credit reporting period"><SelectValue /></SelectTrigger><SelectContent>{["7", "30", "90", "365"].map((d) => <SelectItem key={d} value={d}>Last {d} days</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" size="sm" disabled={!data} onClick={() => data && downloadCsv(`dealmaker-credit-usage-${data.from}-${data.to}.csv`, toCsv([...data.artists.map((x) => ({ group: "Artist", ...x })), ...data.models.map((x) => ({ group: "Model", ...x })), ...data.tasks.map((x) => ({ group: "Task", ...x }))], [["Group", (x) => x.group], ["Name", (x) => x.name], ["Credits used", (x) => x.used], ["Charges", (x) => x.charges]]))}>Export statistics</Button>
        </div>
      </div>
      <div className="admin-overview-kpis">{kpis.map(({ label, value: v, sub, icon: Icon }) => <article className="admin-overview-kpi" key={label}><Icon aria-hidden="true" /><small>{label}</small><strong>{v}</strong><p>{sub}</p></article>)}</div>
      <div className="admin-overview-charts">
        <Panel title="Credits used trend" subtitle={`Credits charged per ${buckets.unit}`} badge="Used"><CreditChart rows={buckets.rows} metric="used" label="Credits used" /></Panel>
        <Panel title="Credits added trend" subtitle={`Credits added per ${buckets.unit}`} badge="Added"><CreditChart rows={buckets.rows} metric="added" label="Credits added" /></Panel>
      </div>
      <div className="admin-overview-distributions">
        <Panel title="Usage by artist" subtitle="Top 10 artists by credits used"><Distribution items={share(data?.artists)} loading={query.isPending} total={total} /></Panel>
        <Panel title="Usage by model" subtitle="Which AI models spent the credits"><Distribution items={share(data?.models)} loading={query.isPending} total={total} /></Panel>
        <Panel title="Usage by task" subtitle="What the credits were spent on"><Distribution items={share(data?.tasks)} loading={query.isPending} total={total} /></Panel>
      </div>
      <section className="admin-overview-panel" aria-labelledby="model-detail-title">
        <header><div><h2 id="model-detail-title">Model detail</h2><p>Charges, tokens and credits for each model</p></div></header>
        <div className="admin-table-wrap"><table><thead><tr><th>Model</th><th className="text-end">Charges</th><th className="text-end">Tokens</th><th className="text-end">Credits used</th></tr></thead><tbody>
          {data?.models.map((m) => <tr key={m.name}><td><b>{m.name}</b></td><td className="admin-money text-end">{credits(m.charges)}</td><td className="admin-money text-end">{credits(m.tokens ?? 0)}</td><td className="admin-money text-end">{credits(m.used)}</td></tr>)}
          {!data?.models.length && <tr><td colSpan={4}>{query.isPending ? "Loading records…" : "No credit was used in this period."}</td></tr>}
        </tbody></table></div>
      </section>
      <h2 className="font-display text-3xl">Ledger entries</h2>
      <AdminRecords kind="credits" />
    </div>
  );
}

function CreditChart({ rows, metric, label }: { rows: { label: string; used: number; added: number }[]; metric: "used" | "added"; label: string }) {
  const color = metric === "used" ? "var(--gold)" : "var(--chart-2)";
  return <div className="admin-overview-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{ top: 12, right: 8, bottom: 0, left: 0 }} accessibilityLayer><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={16} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} /><YAxis width={44} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(v)} /><Tooltip cursor={{ fill: "var(--studio-wash)" }} contentStyle={{ background: "var(--admin-overview-surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }} formatter={(v: unknown) => credits(Number(v))} /><Bar dataKey={metric} name={label} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>;
}
