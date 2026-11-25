import { DashboardArtwork } from "@/components/dashboard/DashboardArtwork";
import { Accent } from "./Accent";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, BadgeCheck, Banknote, CalendarCheck, CalendarRange, CheckCheck, Clock3, ShieldCheck, Users, UserCheck, UserRound, Wallet, XCircle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { getAdminSnapshot } from "@/lib/admin-control.functions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAED } from "./util";

type Destination = "requests" | "verify" | "payouts" | "client-payouts" | "bookings" | "artists" | "escrow" | "allocations";

export function AdminOverview({ onOpen }: { onOpen?: (section: Destination) => void }) {
  const [period, setPeriod] = useState("6");
  const fetchSummary = useServerFn(getAdminSnapshot);
  const query = useQuery({ queryKey: ["admin-overview"], queryFn: () => fetchSummary(), staleTime: 30_000 });
  const data = query.data;
  const months = (data?.months ?? []).slice(-Number(period));
  const statusCount = (name: string) => data?.statuses.find(item => item.name === name)?.value ?? 0;
  const totalArtists = data?.plans.reduce((sum, item) => sum + item.value, 0) ?? 0;
  const number = (value: number | undefined) => data ? (value ?? 0).toLocaleString("en-US") : "…";
  const money = (value: number | undefined) => data ? formatAED(value ?? 0) : "…";
  const kpis = [
    { label: "Total artists", value: number(totalArtists), sub: "Registered talent profiles", icon: Users },
    { label: "Active artists", value: number(data?.activeArtists), sub: "Approved in the marketplace", icon: UserCheck },
    { label: "Pending requests", value: number(data?.pendingArtists), sub: "Awaiting artist approval", icon: Clock3 },
    { label: "Total bookings", value: number(data?.bookings), sub: "Across artist and client portals", icon: CalendarRange },
    { label: "Completed jobs", value: number(statusCount("completed")), sub: "Recorded completed bookings", icon: CalendarCheck },
    { label: "Cancelled jobs", value: number(statusCount("cancelled")), sub: "Recorded cancellations", icon: XCircle },
    { label: "Collected payments", value: money(data?.collected), sub: "VAT included · sandbox payments", icon: Banknote },
    { label: "Escrow / funds on hold", value: money(data?.held), sub: "Held, release pending or frozen", icon: ShieldCheck },
    { label: "Recorded refunds", value: money(data?.refunded), sub: "Authoritative booking refunds", icon: Wallet },
    { label: "Verification queue", value: number(data?.pendingVerification), sub: "Applications awaiting review", icon: BadgeCheck },
    { label: "Artist payout requests", value: number(data?.pendingArtistPayouts), sub: "Pending artist withdrawals", icon: UserRound },
    { label: "Client payout requests", value: number(data?.pendingClientPayouts), sub: "Submitted or approved requests", icon: CheckCheck },
  ];
  const queues: { label: string; count: number | undefined; destination: Destination; icon: typeof Users }[] = [
    { label: "Artist requests awaiting approval", count: data?.pendingArtists, destination: "requests", icon: UserCheck },
    { label: "Verification applications to review", count: data?.pendingVerification, destination: "verify", icon: BadgeCheck },
    { label: "Artist withdrawals pending review", count: data?.pendingArtistPayouts, destination: "payouts", icon: Banknote },
    { label: "Client commission payout requests", count: data?.pendingClientPayouts, destination: "client-payouts", icon: Wallet },
  ];
  if (query.error) return <div role="alert" className="admin-overview-error">Unable to load overview. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div>;

  return (
    <div className="admin-overview" aria-busy={query.isPending}>
      <section className="studio-hello admin-overview-intro" aria-labelledby="control-heading">
        <DashboardArtwork />
        <div className="studio-greeting">
          <small>Dealmaker talent · master admin</small>
          <h2 id="control-heading">Central marketplace <span className="it">control center.</span></h2>
          <p>Artist approvals, bookings, payments and support across the artist and client portals.</p>
          <div className="studio-quick mt-6">
            <Button onClick={() => onOpen?.("requests")}><UserCheck />Review artist requests ({number(data?.pendingArtists)})</Button>
            <Button variant="outline" onClick={() => onOpen?.("payouts")}><Banknote />Artist payouts ({number(data?.pendingArtistPayouts)})</Button>
            <Button variant="outline" onClick={() => onOpen?.("client-payouts")}><Wallet />Client payouts ({number(data?.pendingClientPayouts)})</Button>
          </div>
        </div>
        <div className="admin-overview-emblem"><strong>{number(data?.activeArtists)}</strong><span>Active artists</span><small>Sandbox payment environment</small></div>
      </section>

      <div className="admin-overview-toolbar">
        <span>Marketplace snapshot <span className="admin-overview-muted">· All time</span></span>
        <Button variant="outline" size="sm" onClick={() => onOpen?.("allocations")}>Commission allocations<ArrowUpRight /></Button>
      </div>
      <div className="admin-overview-kpis">
        {kpis.map(({ label, value, sub, icon: Icon }) => <article className="admin-overview-kpi" key={label}><Icon aria-hidden="true" /><small>{label}</small><strong>{value}</strong><p>{sub}</p></article>)}
      </div>

      <div className="admin-overview-toolbar">
        <span>Monthly activity</span>
        <Select value={period} onValueChange={setPeriod}><SelectTrigger className="admin-overview-period" aria-label="Monthly chart period"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="6">Last 6 months</SelectItem><SelectItem value="3">Last 3 months</SelectItem></SelectContent></Select>
      </div>
      <div className="admin-overview-charts">
        <Panel title="Collected payment trend" subtitle="Booking payments received · VAT included" badge="AED">
          <MonthlyChart months={months} metric="revenue" label="Collected (AED)" />
        </Panel>
        <Panel title="Booking volume trend" subtitle="Bookings created across the marketplace" badge="Bookings">
          <MonthlyChart months={months} metric="bookings" label="Bookings" />
        </Panel>
      </div>
      <div className="admin-overview-distributions">
        <Panel title="Booking status" subtitle="Distribution of recorded bookings"><Distribution items={data?.statuses ?? []} loading={query.isPending} total={data?.bookings ?? 0} variant="status" /></Panel>
        <Panel title="Artists by category" subtitle="Approved talent by primary category"><Distribution items={data?.categories ?? []} loading={query.isPending} total={data?.activeArtists ?? 0} /></Panel>
        <Panel title="Plan distribution" subtitle="Current artist plan records"><Distribution items={data?.plans ?? []} loading={query.isPending} total={totalArtists} /></Panel>
      </div>
      <div className="admin-overview-charts">
        <Panel title="Admin action queue" subtitle="Requests requiring an admin decision" badge="Review">
          <div className="admin-overview-queue">{queues.map(({ label, count, destination, icon: Icon }) => <Button key={destination} variant="ghost" onClick={() => onOpen?.(destination)}><span className="admin-overview-queue-icon"><Icon /></span><span>{label}</span><b>{number(count)}</b><ArrowUpRight /></Button>)}</div>
        </Panel>
        <Panel title="Payment & escrow overview" subtitle="Recorded funds, separate from artist and client entitlements" badge="AED">
          <dl className="admin-overview-funds"><div><dt>Collected payments</dt><dd>{money(data?.collected)}</dd></div><div><dt>Funds on hold</dt><dd>{money(data?.held)}</dd></div><div><dt>Recorded refunds</dt><dd>{money(data?.refunded)}</dd></div></dl>
          <div className="admin-overview-actions"><Button variant="outline" size="sm" onClick={() => onOpen?.("escrow")}>Escrow & disputes<ArrowUpRight /></Button><Button variant="outline" size="sm" onClick={() => onOpen?.("allocations")}>Artist & client allocations<ArrowUpRight /></Button></div>
        </Panel>
      </div>
    </div>
  );
}

export function Panel({ title, subtitle, badge, children }: { title: string; subtitle: string; badge?: string; children: ReactNode }) {
  return <section className="admin-overview-panel"><header><div><h2 className="dmr-serif"><Accent text={title} /></h2><p>{subtitle}</p></div>{badge && <span className="admin-overview-badge">{badge}</span>}</header>{children}</section>;
}

function MonthlyChart({ months, metric, label }: { months: { m: string; bookings: number; revenue: number; quotes: number }[]; metric: "revenue" | "bookings"; label: string }) {
  return <div className="admin-overview-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={months} margin={{ top: 25, right: 8, bottom: 0, left: 8 }} accessibilityLayer><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="m" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} /><Tooltip cursor={{ fill: "var(--studio-wash)" }} contentStyle={{ background: "var(--admin-overview-surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }} formatter={(value: unknown) => metric === "revenue" ? formatAED(Number(value)) : Number(value).toLocaleString("en-US")} /><Bar dataKey={metric} name={label} fill={metric === "revenue" ? "var(--gold)" : "var(--chart-2)"} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}><LabelList dataKey={metric} position="top" fill={metric === "revenue" ? "var(--gold)" : "var(--chart-2)"} fontSize={10} formatter={(value: unknown) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })} /></Bar></BarChart></ResponsiveContainer></div>;
}

export function Distribution({ items, total, loading, variant = "gold" }: { items: { name: string; value: number }[]; total: number; loading: boolean; variant?: "gold" | "status" }) {
  if (loading) return <p className="admin-overview-empty">Loading records…</p>;
  if (items.length === 0) return <p className="admin-overview-empty">No records yet.</p>;
  return <div className="admin-overview-distribution">{items.map(item => { const percent = total > 0 ? Math.round(item.value / total * 100) : 0; return <div key={item.name} className={`admin-overview-distribution-row ${variant === "status" ? `status-${item.name}` : ""}`}><div><span>{item.name.replace(/_/g, " ")}</span><small>{item.value.toLocaleString("en-US")} ({percent}%)</small></div><meter min={0} max={Math.max(total, 1)} value={item.value} aria-label={`${item.name}: ${item.value}`} /></div>; })}</div>;
}