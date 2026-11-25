import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RateCardTable } from "@/components/dashboard/RateCardTable";
import { RatecardDetails } from "@/components/shared/RatecardDetails";
import { InvoicePreviewDialog } from "@/components/dashboard/InvoicePreviewDialog";
import type { PaperData } from "@/components/dashboard/InvoicePaper";
import { paperFor, toInvoiceRows, type InvoiceRow } from "@/components/dashboard/InvoiceRecords";
import { invoiceMoney } from "@/lib/invoice";
import { topByRevenue } from "@/lib/admin-artists";
import { dateLabel, useArtistPhotos, useArtists, useArtistStats, usePlans, type AdminArtist } from "./artists/data";
import { Cover, ListState, usePaged } from "./artists/parts";

type Stat = NonNullable<ReturnType<typeof useArtistStats>["data"]> extends Map<string, infer Row> ? Row : never;
const STAT_ROWS: [label: string, key: keyof Stat][] = [
  ["Profile views", "profile_views"], ["Chat income", "chat_income"], ["Form income", "form_income"], ["Invoices sent", "invoice_sent"],
  ["Invoices unpaid", "invoice_unpaid"], ["Invoices paid", "invoice_paid"], ["Revenue", "revenue"], ["Total jobs", "total_job"], ["Total jobs done", "job_done"],
];

export function AdminRatecards() {
  const query = useArtists();
  const statsQuery = useArtistStats();
  const stats = statsQuery.data;
  const plans = usePlans().data ?? [];
  const rates = useQuery({
    queryKey: ["admin-ratecard-summaries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rate_cards").select("id,artist_id,title,price,sort").order("sort");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const [q, setQ] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);
  const [managing, setManaging] = useState<string | null>(null);
  const rows = (query.data ?? []).filter((a) => a.stage_name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(stats?.get(b.id)?.revenue ?? 0) - Number(stats?.get(a.id)?.revenue ?? 0) || a.stage_name.localeCompare(b.stage_name));
  const { slice, pager, first } = usePaged(rows);
  const photos = useArtistPhotos(slice);
  const top = topByRevenue((query.data ?? []).map((a) => ({ name: a.stage_name, revenue: Number(stats?.get(a.id)?.revenue ?? 0) })));
  const viewed = query.data?.find((a) => a.id === viewing);
  const qc = useQueryClient();
  const managed = query.data?.find((a) => a.id === managing);
  // Edited rate cards show on the cards as soon as the editor closes.
  const back = () => { setManaging(null); void qc.invalidateQueries({ queryKey: ["admin-ratecard-summaries"] }); void qc.invalidateQueries({ queryKey: ["admin-artist-rates"] }); };

  if (managed) return (
    <div className="space-y-4">
      <Button variant="outline" onClick={back}>Back to all artists</Button>
      <p className="text-sm text-muted-foreground">Editing the rate cards of <b className="text-foreground">{managed.stage_name}</b>.</p>
      <RateCardTable key={managed.id} artistId={managed.id} adminMode />
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">When an artist changes a rate, bookings and invoices already issued keep their own amounts.</p>
      <section className="adm-panel" aria-labelledby="top-revenue-title">
        <div className="adm-title"><h2 id="top-revenue-title" className="font-display">Top 10 talent by revenue</h2><span className="adm-meta">Net of platform fee, completed jobs. Sample bookings are not counted.</span></div>
        {statsQuery.error ? <p role="alert" className="adm-empty text-destructive">Could not load statistics.</p> : !top.length ? <p className="adm-empty">{statsQuery.isPending ? "Loading…" : "No completed paid job yet, so there is no revenue to rank."}</p> : <>
          <div className="h-72 min-w-0" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={top} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={58} tickFormatter={(name: string) => (name.length > 14 ? `${name.slice(0, 13)}…` : name)} />
                <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={64} tickFormatter={(value: number) => value.toLocaleString("en-US", { notation: "compact" })} />
                <Tooltip formatter={(value: number) => [invoiceMoney(value), "Revenue"]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
                <Line type="monotone" dataKey="revenue" stroke="var(--gold)" strokeWidth={2.5} dot={{ r: 4, fill: "var(--gold)" }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ol className="sr-only">{top.map((row) => <li key={row.name}>{row.name}: {invoiceMoney(row.revenue)}</li>)}</ol>
        </>}
      </section>
      <div className="admin-toolbar">
        <Input aria-label="Search artists" placeholder="Search artist…" value={q} onChange={(e) => { setQ(e.target.value); first(); }} />
        <span className="ms-auto text-sm text-muted-foreground">{rows.length} artists, highest revenue first</span>
      </div>
      <ListState pending={query.isPending || rates.isPending} error={query.error ?? rates.error} empty={rows.length ? null : "No artist matches this search."}>
        <div className="adm-grid">
          {slice.map((a) => {
            const s = stats?.get(a.id), own = rates.data?.filter((r) => r.artist_id === a.id) ?? [];
            const plan = plans.find((p) => p.code === (s?.plan_code ?? a.plan))?.name;
            return (
              <article key={a.id} className="adm-card">
                <Cover artist={a} photo={photos.get(a.id)} plan={s?.plan_code ?? a.plan} />
                <div className="adm-body">
                  <div className="adm-title"><h2>{a.stage_name}</h2><span className="adm-meta">{own.length} rate card{own.length === 1 ? "" : "s"}</span></div>
                  <p className="adm-meta">{a.categories?.name ?? "No category"} · Subscription <b>{plan ?? "—"}</b></p>
                  <ul className="grid gap-1">{own.slice(0, 3).map((r) => <li key={r.id} className="flex justify-between gap-3 text-xs"><span className="min-w-0 truncate">{r.title}</span><b className="adm-money">{invoiceMoney(Number(r.price))}</b></li>)}{own.length > 3 && <li className="adm-meta">+ {own.length - 3} more</li>}{!own.length && <li className="adm-meta">No rate card yet.</li>}</ul>
                  <h3 className="adm-heading mt-auto">Profile statistics</h3>
                  <dl className="adm-stats">{STAT_ROWS.map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{!s ? "…" : key === "revenue" ? invoiceMoney(Number(s.revenue)) : Number(s[key]).toLocaleString("en-US")}</dd></div>)}</dl>
                  <Button size="sm" onClick={() => setViewing(a.id)} aria-label={`View history of ${a.stage_name}`}>View history</Button>
                </div>
              </article>
            );
          })}
        </div>
      </ListState>
      {pager}
      {viewed && <History artist={viewed} onClose={() => setViewing(null)} onEdit={() => { setViewing(null); setManaging(viewed.id); }} />}
    </div>
  );
}

const payOf = (r: InvoiceRow) => (r.status === "paid" ? "paid" : r.paid > 0 ? "partial" : "unpaid");

/** The artist's invoices, read and totalled the same way as their own Invoices page, plus their rate cards. */
function History({ artist, onClose, onEdit }: { artist: AdminArtist; onClose: () => void; onEdit: () => void }) {
  const rates = useQuery({
    queryKey: ["admin-artist-rates", artist.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("rate_cards").select("*").eq("artist_id", artist.id).order("sort");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid">("all");
  const [preview, setPreview] = useState<PaperData | null>(null);
  const invoices = useQuery({
    queryKey: ["admin-artist-invoices", artist.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_invoices").select("id, number, document, total, status, paid_at, created_at, conversation_id, hidden_at, bookings(client_name, client_email, total, paid_amount, deposit_pct), conversations(quote_requests(name))").eq("artist_id", artist.id).is("deleted_at", null).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return toInvoiceRows((data ?? []).map((row) => ({ ...row, artist_id: artist.id, artists: { stage_name: artist.stage_name, trn: artist.trn } })));
    },
  });
  const all = invoices.data ?? [];
  const groups = { all, unpaid: all.filter((r) => r.status !== "paid"), paid: all.filter((r) => r.status === "paid") };
  const totals: [string, InvoiceRow[], number][] = [
    ["Invoices sent", groups.all, groups.all.reduce((n, r) => n + Number(r.total), 0)],
    ["Invoices unpaid", groups.unpaid, groups.unpaid.reduce((n, r) => n + Math.max(0, Number(r.total) - r.paid), 0)],
    ["Invoices paid", groups.paid, groups.paid.reduce((n, r) => n + Number(r.total), 0)],
  ];
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && !preview && onClose()}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-24px)] max-w-5xl overflow-y-auto">
          <DialogHeader className="text-start"><DialogTitle className="font-display text-3xl">{artist.stage_name}</DialogTitle><DialogDescription>Invoice history and rate cards.</DialogDescription></DialogHeader>
          <Tabs defaultValue="invoices" className="min-w-0">
            <TabsList><TabsTrigger value="invoices">Invoices</TabsTrigger><TabsTrigger value="rates">Rate cards</TabsTrigger></TabsList>
            <TabsContent value="invoices" className="space-y-4">
              {invoices.error ? <p role="alert" className="text-destructive">Could not load invoices.</p> : invoices.isPending ? <p role="status">Loading…</p> : <>
                <div className="grid gap-3 sm:grid-cols-3">{totals.map(([label, list, amount], index) => <button key={label} type="button" className="adm-panel !gap-1 text-start" aria-pressed={filter === (["all", "unpaid", "paid"] as const)[index]} style={filter === (["all", "unpaid", "paid"] as const)[index] ? { borderColor: "var(--gold)" } : undefined} onClick={() => setFilter((["all", "unpaid", "paid"] as const)[index]!)}><span className="adm-meta">{label}</span><b className="text-2xl">{list.length}</b><span className="adm-meta">{invoiceMoney(amount)}{index === 1 ? " outstanding" : ""}</span></button>)}</div>
                <ul className="grid gap-2">
                  {groups[filter].map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3 text-sm">
                      <div className="min-w-0 flex-1"><b className="break-all">{r.number}</b><p className="adm-meta">{r.client} · sent {dateLabel(r.created_at)}{r.paid_at ? ` · paid ${dateLabel(r.paid_at)}` : ""}</p></div>
                      <span className="adm-money">{invoiceMoney(Number(r.total))}{payOf(r) === "partial" && <span className="adm-meta block">Paid {invoiceMoney(r.paid)}</span>}</span>
                      <span className={`adm-pill is-${payOf(r)}`}>{payOf(r)}</span>
                      <Button size="sm" variant="outline" onClick={() => setPreview(paperFor(r))} aria-label={`View invoice ${r.number}`}>View</Button>
                    </li>
                  ))}
                  {!groups[filter].length && <li className="adm-empty">No invoice in this group.</li>}
                </ul>
              </>}
            </TabsContent>
            <TabsContent value="rates" className="space-y-4">
              {rates.error ? <p role="alert" className="text-destructive">Could not load rate cards.</p> : rates.isPending ? <p role="status">Loading…</p> : rates.data.length ? rates.data.map((rate) => <section key={rate.id} className="adm-panel"><div className="adm-title"><b>{rate.title}</b><b className="adm-money">{invoiceMoney(Number(rate.price))}</b></div><RatecardDetails rate={rate} /></section>) : <p className="adm-empty">No rate card yet.</p>}
              <Button size="sm" onClick={onEdit}>Edit rate cards</Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <InvoicePreviewDialog data={preview} onClose={() => setPreview(null)} />
    </>
  );
}
