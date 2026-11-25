import { useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PLAN_LIMITS } from "@/lib/admin-artists";
import { downloadCsv, toCsv } from "@/lib/csv";
import { ListState } from "./artists/parts";

const number = (n: number | string | null | undefined) => Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" }) : "—");
const planName = (code: string) => code.replace(/^./, (c) => c.toUpperCase());

type Usage = {
  plan: Record<string, unknown> & { name: string; price_monthly: number; price_yearly: number; allowed_models: string[]; commission_pct: number };
  used: Record<string, number>; activity: { ai_balance: number; conversations: number; bookings: number; invoices: number; rate_cards: number };
};

/** How much of one package limit an artist uses. A limit of -1 means unlimited. */
export function usageRow(used: number, limit: number) {
  const unlimited = limit < 0;
  return { used, limit, unlimited, percent: unlimited ? 0 : limit === 0 ? (used > 0 ? 100 : 0) : Math.round((used / limit) * 100), over: !unlimited && used > limit };
}

export function AdminSubscriptions() {
  const query = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      const r = await supabase.rpc("admin_subscriptions");
      if (r.error) throw new Error("Unable to load subscriptions");
      return r.data ?? [];
    },
  });
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("all");
  const [viewing, setViewing] = useState<string | null>(null);
  const all = query.data ?? [];
  const rows = all.filter((r) => (plan === "all" || r.plan_code === plan) && r.artist_name.toLowerCase().includes(q.trim().toLowerCase()));
  const plans = [...new Set(all.map((r) => r.plan_code))];
  const active = all.filter((r) => r.subscription_status && r.paid_until && Date.parse(r.paid_until) > Date.now());
  const selected = all.find((r) => r.artist_id === viewing);
  const kpis: [string, string, string][] = [
    ["Artists", number(all.length), `${number(all.length - active.length)} without a running paid period`],
    ["Paid subscriptions", number(active.length), `${number(active.filter((r) => r.cancels).length)} set to end at the paid-until date`],
    ["AI credits used", number(all.reduce((n, r) => n + Number(r.ai_used_30d), 0)), "Last 30 days"],
    ["AI credits held", number(all.reduce((n, r) => n + Number(r.ai_balance), 0)), "In artist wallets now"],
  ];
  return (
    <div className="space-y-5">
      <div className="adm-grid is-kpi">{kpis.map(([label, value, note]) => <section key={label} className="adm-panel !gap-1"><span className="adm-meta">{label}</span><b className="font-display text-4xl font-normal">{value}</b><span className="adm-meta">{note}</span></section>)}</div>
      <div className="admin-toolbar">
        <Input aria-label="Search subscriptions" placeholder="Search artist…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={plan} onValueChange={setPlan}><SelectTrigger className="w-44" aria-label="Package"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All packages</SelectItem>{plans.map((p) => <SelectItem key={p} value={p}>{planName(p)}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" disabled={!rows.length} onClick={() => downloadCsv("dealmaker-subscriptions.csv", toCsv(rows, [["Artist", (r) => r.artist_name], ["Package", (r) => r.plan_code], ["Billing", (r) => r.billing_interval], ["Status", (r) => r.subscription_status ?? "none"], ["Paid until", (r) => r.paid_until], ["AI balance", (r) => r.ai_balance], ["AI used 30 days", (r) => r.ai_used_30d]]))}>Export CSV</Button>
      </div>
      <ListState pending={query.isPending} error={query.error} empty={rows.length ? null : "No artist matches."}>
        <div className="admin-table-wrap"><table><thead><tr><th>Artist</th><th>Package</th><th>Billing</th><th>Paid until</th><th className="text-end">AI credits left</th><th className="text-end">Used (30 days)</th><th>Subscription</th><th>View</th></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.artist_id}>
              <td><b>{r.artist_name}</b><div className="admin-row-detail">Artist {r.artist_status}</div></td>
              <td><span className="adm-pill is-approved">{planName(r.plan_code)}</span></td>
              <td>{r.billing_interval ?? "—"}</td><td>{day(r.paid_until)}</td>
              <td className="admin-money text-end"><b>{number(r.ai_balance)}</b></td><td className="admin-money text-end">{number(r.ai_used_30d)}</td>
              <td>{r.subscription_status ? <>{r.subscription_status}{r.cancels && <div className="admin-row-detail">Ends at period end</div>}</> : <span className="adm-meta">No subscription</span>}</td>
              <td><Button size="sm" variant="outline" aria-label={`View usage of ${r.artist_name}`} onClick={() => setViewing(r.artist_id)}><Eye />View</Button></td>
            </tr>
          ))}
        </tbody></table></div>
      </ListState>
      {selected && <UsageDialog artistId={selected.artist_id} name={selected.artist_name} onClose={() => setViewing(null)} />}
    </div>
  );
}

function UsageDialog({ artistId, name, onClose }: { artistId: string; name: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["admin-subscription-usage", artistId],
    queryFn: async () => {
      const r = await supabase.rpc("admin_subscription_usage", { _artist: artistId });
      if (r.error) throw new Error("Unable to load usage");
      return r.data as unknown as Usage | null;
    },
  });
  const data = query.data;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[calc(100dvh-32px)] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{name}</DialogTitle><DialogDescription>{data ? `${data.plan.name} package · AED ${number(data.plan.price_monthly)} monthly · ${number(data.plan.commission_pct)}% platform commission` : "Package usage"}</DialogDescription></DialogHeader>
        <ListState pending={query.isPending} error={query.error} empty={data ? null : "No package record for this artist."}>
          {data && <>
            <dl className="admin-detail-grid">
              {([["AI credits left", data.activity.ai_balance], ["Conversations", data.activity.conversations], ["Bookings", data.activity.bookings], ["Invoices", data.activity.invoices], ["Rate cards", data.activity.rate_cards]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}
              <div><dt>AI models</dt><dd className="capitalize">{data.plan.allowed_models.join(", ")}</dd></div>
            </dl>
            <h3 className="font-display text-2xl">Package usage</h3>
            <div className="admin-overview-distribution">
              {PLAN_LIMITS.filter((l) => l.key in data.used).map((limit) => { const row = usageRow(Number(data.used[limit.key]), Number(data.plan[limit.key])); const label = limit.label.replace(" (-1 unlimited)", ""); return (
                <div key={limit.key} className="admin-overview-distribution-row">
                  <div><span>{label}{limit.key === "ai_credits" && " (used this month)"}</span><small className={row.over ? "!text-destructive" : undefined}>{number(row.used)} of {row.unlimited ? "unlimited" : number(row.limit)}{!row.unlimited && ` (${row.percent}%)`}{row.over && " · over the limit"}</small></div>
                  <meter min={0} max={100} value={Math.min(row.percent, 100)} aria-label={`${label}: ${row.used} used`} />
                </div>
              ); })}
            </div>
          </>}
        </ListState>
      </DialogContent>
    </Dialog>
  );
}
