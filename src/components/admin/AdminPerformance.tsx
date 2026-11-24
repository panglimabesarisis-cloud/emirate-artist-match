import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getArtistPerformance, type ArtistPerformance } from "@/lib/admin-performance.functions";
import { downloadCsv, toCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAED } from "./util";

const METRICS = [
  { key: "incoming", label: "Incoming messages", note: "All messages received from clients" },
  { key: "invoiceSent", label: "Invoice sent", note: "Issued invoices, linked records counted once" },
  { key: "unpaidInvoice", label: "Unpaid invoice", note: "Issued in this period, still awaiting full payment" },
  { key: "aiReply", label: "AI reply", note: "Stored replies sent by the booking agent" },
  { key: "artistReply", label: "Artist reply", note: "Stored replies sent by artists or their team" },
  { key: "clientReply", label: "Client reply", note: "Client messages after their first message in each chat" },
] as const;
const COLORS = ["var(--gold)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const count = (value: number) => value.toLocaleString("en-US");
const dateLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function AdminPerformance() {
  const [days, setDays] = useState("30");
  const [artist, setArtist] = useState("all");
  const [page, setPage] = useState(0);
  const fetchPerformance = useServerFn(getArtistPerformance);
  const query = useQuery({ queryKey: ["admin-performance", days, artist, page], queryFn: () => fetchPerformance({ data: { days: Number(days), artistId: artist === "all" ? null : artist, page } }), staleTime: 30_000 });
  const data = query.data;
  const selectedName = data?.artists.find(item => item.id === artist)?.name ?? "All artists";
  const max = Math.max(1, ...METRICS.map(metric => data?.statistics[metric.key] ?? 0));
  const kpis = [
    { label: "Bookings received", value: data ? count(data.summary.bookings) : "…", note: "Bookings created in the selected period" },
    { label: "Average booking value", value: data ? formatAED(data.summary.averageBookingValue) : "…", note: "Quoted service amount, excluding VAT" },
    { label: "Booking completion rate", value: data ? data.summary.completionRate === null ? "—" : `${data.summary.completionRate}%` : "…", note: "Completed / bookings created in this period" },
    { label: "AI share of replies", value: data ? data.summary.aiShare === null ? "—" : `${data.summary.aiShare}%` : "…", note: "AI / combined AI and artist replies" },
  ];

  if (query.isError) return <div className="admin-overview-error" role="alert">Unable to load performance analytics. <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div>;
  return <div className="admin-performance" aria-busy={query.isFetching}>
    <div className="admin-performance-toolbar">
      <div className="admin-performance-filters">
        <Select value={artist} onValueChange={value => { setArtist(value); setPage(0); }}><SelectTrigger aria-label="Filter performance by artist" className="admin-performance-artist"><SelectValue placeholder="All artists" /></SelectTrigger><SelectContent><SelectItem value="all">All artists</SelectItem>{data?.artists.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
        <Select value={days} onValueChange={value => { setDays(value); setPage(0); }}><SelectTrigger aria-label="Performance reporting period" className="admin-overview-period"><SelectValue /></SelectTrigger><SelectContent>{[30, 90, 180, 365].map(value => <SelectItem key={value} value={String(value)}>Last {value} days</SelectItem>)}</SelectContent></Select>
      </div>
      <Button variant="outline" size="sm" disabled={!data || query.isFetching} onClick={() => data && exportPerformance(data, selectedName)}><Download />Export analytics CSV</Button>
    </div>
    <div className="admin-performance-dateline"><span>{data ? `${dateLabel(data.from)} ${data.from.slice(0, 4)} to ${dateLabel(data.to)} ${data.to.slice(0, 4)}` : "Loading reporting period…"}</span><span>Dubai time · {selectedName}</span></div>
    <div className="admin-performance-kpis">{kpis.map(item => <article key={item.label} className="admin-overview-kpi"><small>{item.label}</small><strong>{item.value}</strong><p>{item.note}</p></article>)}</div>

    <div className="admin-performance-reports">
      <section className="admin-overview-panel admin-performance-statistics" aria-labelledby="artist-statistic-heading">
        <header><div><h2 id="artist-statistic-heading">Statistic Artist</h2><p>Messages and issued invoices · selected period</p></div><span className="admin-overview-badge">Activity</span></header>
        <div className="admin-performance-bars">{METRICS.map((metric, index) => <div className={`admin-performance-bar-row metric-${metric.key}`} key={metric.key}>
          <div><span><small>{String(index + 1).padStart(2, "0")}</small>{metric.label}</span><strong>{data ? count(data.statistics[metric.key]) : "…"}</strong></div>
          <meter min={0} max={max} value={data?.statistics[metric.key] ?? 0} aria-label={`${metric.label}: ${data ? count(data.statistics[metric.key]) : "loading"}`} />
          <p>{metric.note}</p>
        </div>)}</div>
      </section>

      <section className="admin-overview-panel admin-performance-ranking" aria-labelledby="ranking-heading">
        <header><div><h2 id="ranking-heading">Artist performance ranking</h2><p>Completed jobs in this period · published lifetime ratings</p></div><span className="admin-overview-badge">{data ? count(data.rankingTotal) : "…"} artists</span></header>
        <div className="admin-performance-table"><table><thead><tr><th scope="col">Rank</th><th scope="col">Artist</th><th scope="col">Completed</th><th scope="col">Rating</th><th scope="col">Job value</th></tr></thead><tbody>
          {data?.ranking.map((row, index) => <tr key={row.id}><td className="admin-performance-rank">{String(page * 10 + index + 1).padStart(2, "0")}</td><th scope="row"><div className="admin-performance-name"><span aria-hidden="true" className="admin-performance-avatar">{row.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span><span>{row.name}<small>{row.plan} plan · {count(row.incoming)} incoming</small></span></div></th><td>{count(row.completed)}</td><td>{row.rating === null ? "—" : Number(row.rating).toFixed(1)}</td><td className="admin-money">{formatAED(row.booking_value)}</td></tr>)}
          {!data && <tr><td colSpan={5}>Loading artist records…</td></tr>}
          {data?.ranking.length === 0 && <tr><td colSpan={5}>No artist records for this selection.</td></tr>}
        </tbody></table></div>
        <div className="admin-page-foot"><span>Page {page + 1} of {Math.max(1, Math.ceil((data?.rankingTotal ?? 0) / 10))}</span><div className="admin-foot-actions"><Button variant="outline" size="icon" aria-label="Previous ranking page" disabled={page === 0 || query.isFetching} onClick={() => setPage(value => value - 1)}><ChevronLeft /></Button><Button variant="outline" size="icon" aria-label="Next ranking page" disabled={!data || (page + 1) * 10 >= data.rankingTotal || query.isFetching} onClick={() => setPage(value => value + 1)}><ChevronRight /></Button></div></div>
      </section>
    </div>

    <section className="admin-overview-panel admin-performance-completion" aria-labelledby="completion-heading">
      <header><div><h2 id="completion-heading">Job complete · artist trend</h2><p>Daily completed bookings · top 5 selected artists · Dubai time</p></div><div className="admin-performance-completed-total"><strong>{data ? count(data.summary.completedJobs) : "…"}</strong><span>Completed jobs</span></div></header>
      <div className="admin-performance-legend">{data?.series.map((item, index) => <span key={item.id} className={`series-${index}`}><i aria-hidden="true" />{item.name}</span>)}</div>
      {data && data.summary.completedJobs === 0 && <p className="admin-performance-empty">No completed jobs recorded in this period.</p>}
      <CompletionChart data={data} />
      <details className="admin-performance-daily"><summary>Daily completed jobs</summary><div className="admin-performance-table"><table><thead><tr><th scope="col">Date</th>{data?.series.map(item => <th scope="col" key={item.id}>{item.name}</th>)}<th scope="col">All selected artists</th></tr></thead><tbody>{data?.daily.map(day => <tr key={day.date}><th scope="row">{day.date}</th>{data.series.map(item => <td key={item.id}>{count(day.artists[item.id] ?? 0)}</td>)}<td>{count(day.total)}</td></tr>)}</tbody></table></div></details>
    </section>
  </div>;
}

function CompletionChart({ data }: { data: ArtistPerformance | undefined }) {
  const rows = data?.daily.map(day => ({ date: day.date, ...day.artists })) ?? [];
  return <div className="admin-performance-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={rows} margin={{ top: 12, right: 12, left: 0, bottom: 8 }} accessibilityLayer>
    <defs>{data?.series.map((item, index) => <linearGradient key={item.id} id={`performance-${item.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.25} /><stop offset="100%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.01} /></linearGradient>)}</defs>
    <CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="date" tickFormatter={dateLabel} axisLine={false} tickLine={false} minTickGap={48} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} width={36} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
    <Tooltip labelFormatter={label => String(label)} contentStyle={{ background: "var(--admin-overview-surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }} formatter={(value: unknown) => `${count(Number(value))} jobs`} />
    {data?.series.map((item, index) => <Area key={item.id} type="linear" dataKey={item.id} name={item.name} stroke={COLORS[index % COLORS.length]} fill={`url(#performance-${item.id})`} strokeWidth={2} fillOpacity={1} isAnimationActive={false} dot={false} activeDot={{ r: 4 }} />)}
  </AreaChart></ResponsiveContainer></div>;
}

function exportPerformance(data: ArtistPerformance, artist: string) {
  const rows: { date: string; artist: string; metric: string; value: number | null }[] = METRICS.map(item => ({ date: `${data.from} to ${data.to}`, artist, metric: item.label, value: data.statistics[item.key] }));
  for (const day of data.daily) {
    rows.push({ date: day.date, artist, metric: "Total completed jobs", value: day.total });
    for (const item of data.series) rows.push({ date: day.date, artist: item.name, metric: "Artist completed jobs", value: day.artists[item.id] ?? 0 });
  }
  downloadCsv(`dealmaker-performance-${data.from}-${data.to}.csv`, toCsv(rows, [["Date / Dubai", row => row.date], ["Artist", row => row.artist], ["Metric", row => row.metric], ["Value", row => row.value]]));
}