import { bookingStage, STAGE_COLOR } from "@/lib/booking-stage";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useInvoiceQuery } from "./InvoiceRecords";

const MONTHS = 6;
const aed = (n: number) => `AED ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: unknown) => Number(n ?? 0) || 0;

type Wallet = { available?: number | string | null; gross?: number | string | null; paid_out?: number | string | null; pending?: number | string | null; commission_pct?: number | string | null } | undefined;

/** Everything the Overview charts need, loaded once and shared. */
export function useOverviewMoney(artistId: string) {
  return useQuery({
    queryKey: ["overview-money", artistId],
    refetchInterval: 30000,
    queryFn: async () => {
      const since = new Date(); since.setMonth(since.getMonth() - MONTHS - 1);
      const [b, p, c, m] = await Promise.all([
        supabase.from("bookings").select("status, amount, total, paid_amount, paid_at, completed_at, cancelled_at, created_at, escrow_status").eq("artist_id", artistId).is("deleted_at", null),
        supabase.from("payout_requests").select("amount, status, created_at").eq("artist_id", artistId),
        supabase.from("conversations").select("created_at").eq("artist_id", artistId).gte("created_at", since.toISOString()),
        supabase.from("messages").select("sender, created_at, conversations!inner(artist_id)").eq("conversations.artist_id", artistId).gte("created_at", since.toISOString()).limit(5000),
      ]);
      return { bookings: b.data ?? [], payouts: p.data ?? [], chats: c.data ?? [], messages: m.data ?? [] };
    },
  });
}

/** Escrow held now (excl. VAT): paid_amount scaled to the job fee, for bookings still in escrow. */
export function escrowNow(bookings: Array<{ escrow_status: string; paid_amount: number | string; amount: number | string; total: number | string }>) {
  return bookings.filter((b) => b.escrow_status === "held").reduce((n, b) => n + (num(b.total) > 0 ? (num(b.paid_amount) * num(b.amount)) / num(b.total) : 0), 0);
}

function monthBuckets() {
  const now = new Date();
  return Array.from({ length: MONTHS }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1) + i, 1);
    const end = i === MONTHS - 1 ? now : new Date(start.getFullYear(), start.getMonth() + 1, 1, 0, 0, 0, -1);
    return { label: start.toLocaleString("en-GB", { month: "short" }), start, end };
  });
}
const inMonth = (iso: string | null | undefined, m: { start: Date; end: Date }) => !!iso && new Date(iso) >= m.start && new Date(iso) <= m.end;

const tip = { background: "#0f1424", border: "1px solid rgba(246,239,226,.16)", borderRadius: 12, fontSize: 12, color: "#f6efe2" } as const;
const axis = { fontSize: 11, stroke: "rgba(246,239,226,.4)", tickLine: false, axisLine: false } as const;

type Series = { key: string; label: string; color: string; value: string };

/** One titled card with a legend of current totals and a smooth area chart. */
function AreaCard({ id, title, accent, subtitle, series, data, empty, emptyText, note, money = false }: {
  id: string; title: string; accent: string; subtitle: string; series: Series[]; data: Array<Record<string, number | string>>; empty: boolean; emptyText: string; note?: string; money?: boolean;
}) {
  const { t } = useI18n();
  return (
    <section className="studio-panel studio-span-6" aria-labelledby={`ov-${id}`}>
      <div className="studio-panel-heading"><h2 id={`ov-${id}`}>{title} <span className="it">{accent}</span><small>{subtitle}</small></h2></div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-2">
        {series.map((s) => <li key={s.key} className="flex items-center gap-2 text-xs text-muted-foreground"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />{s.label}<b className="font-display text-lg font-normal text-foreground" dir="ltr">{s.value}</b></li>)}
      </ul>
      <div className="relative h-60" role="img" aria-label={`${title} ${accent}: ${series.map((s) => s.label).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, left: money ? -10 : -18, bottom: 0 }}>
            <defs>{series.map((s) => <linearGradient key={s.key} id={`g-${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={0.32} /><stop offset="100%" stopColor={s.color} stopOpacity={0} /></linearGradient>)}</defs>
            <CartesianGrid stroke="rgba(246,239,226,.09)" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="label" tickFormatter={(v: string) => t(v)} {...axis} />
            <YAxis allowDecimals={false} {...axis} {...(money ? { tickFormatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}K` : String(v)) } : {})} />
            <Tooltip contentStyle={tip} cursor={{ stroke: "rgba(246,239,226,.2)" }} {...(money ? { formatter: (v: number) => aed(v) } : {})} />
            {series.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} fill={`url(#g-${id}-${s.key})`} />)}
          </AreaChart>
        </ResponsiveContainer>
        {empty && <p className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground">{emptyText}</p>}
      </div>
      {note && <p className="mt-2 text-[11px] text-muted-foreground">{note}</p>}
    </section>
  );
}

const total = (data: Array<Record<string, number | string>>, k: string) => data.reduce((n, m) => n + num(m[k]), 0);

/** Chats perform: incoming chats, AI replies, client replies and invoices sent, per month. */
export function ChatsPerformChart({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const money = useOverviewMoney(artistId);
  const inv = useInvoiceQuery(artistId);
  const data = useMemo(() => monthBuckets().map((m) => ({
    label: m.label,
    incoming: (money.data?.chats ?? []).filter((c) => inMonth(c.created_at, m)).length,
    ai: (money.data?.messages ?? []).filter((x) => x.sender === "ai" && inMonth(x.created_at, m)).length,
    client: (money.data?.messages ?? []).filter((x) => x.sender === "client" && inMonth(x.created_at, m)).length,
    yours: (money.data?.messages ?? []).filter((x) => x.sender === "artist" && inMonth(x.created_at, m)).length,
    sent: (inv.data ?? []).filter((r) => inMonth(r.created_at, m)).length,
  })), [money.data, inv.data]);
  return (
    <AreaCard id="chats" title={t("Chats")} accent={t("perform")} subtitle={t("Last 6 months")} data={data}
      series={[{ key: "incoming", label: t("Incoming chat"), color: "#e8b04a", value: String(total(data, "incoming")) }, { key: "ai", label: t("AI reply"), color: "#6aa9ff", value: String(total(data, "ai")) },
        { key: "client", label: t("Client reply"), color: "#b7a6ff", value: String(total(data, "client")) }, { key: "yours", label: t("Your reply"), color: "#ff9bd2", value: String(total(data, "yours")) }, { key: "sent", label: t("Invoice send"), color: "#7bd88f", value: String(total(data, "sent")) }]}
      empty={data.every((m) => m.incoming + m.ai + m.client + m.yours + m.sent === 0)} emptyText={t("No chats yet.")} note={t("Your reply counts messages you or your team send after taking over a chat.")} />
  );
}

/** Invoice progress: invoices sent, still unpaid and paid, per month. */
export function InvoiceProgressChart({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const inv = useInvoiceQuery(artistId);
  const data = useMemo(() => monthBuckets().map((m) => ({
    label: m.label,
    sent: (inv.data ?? []).filter((r) => inMonth(r.created_at, m)).length,
    unpaid: (inv.data ?? []).filter((r) => r.status !== "paid" && inMonth(r.created_at, m)).length,
    paid: (inv.data ?? []).filter((r) => r.status === "paid" && inMonth(r.paid_at ?? r.created_at, m)).length,
  })), [inv.data]);
  return (
    <AreaCard id="invoices" title={t("Invoice")} accent={t("progress")} subtitle={t("Last 6 months")} data={data}
      series={[{ key: "sent", label: t("Invoice send"), color: "#e8b04a", value: String(total(data, "sent")) }, { key: "unpaid", label: t("Invoice unpaid"), color: "#e2574c", value: String(total(data, "unpaid")) }, { key: "paid", label: t("Invoice paid"), color: "#7bd88f", value: String(total(data, "paid")) }]}
      empty={data.every((m) => m.sent + m.unpaid + m.paid === 0)} emptyText={t("No invoices yet.")} />
  );
}

/** Job progress: bookings made and jobs completed, per month. */
export function JobProgressChart({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const money = useOverviewMoney(artistId);
  const data = useMemo(() => monthBuckets().map((m) => {
    const all = (money.data?.bookings ?? []).filter((b) => b.status !== "cancelled");
    return {
      label: m.label,
      soft: all.filter((b) => bookingStage(b) === "soft" && inMonth(b.created_at, m)).length,
      job: all.filter((b) => bookingStage(b) !== "soft" && inMonth(b.paid_at ?? b.created_at, m)).length,
      complete: all.filter((b) => bookingStage(b) === "complete" && inMonth(b.completed_at, m)).length,
    };
  }), [money.data]);
  return (
    <AreaCard id="jobs" title={t("Progress")} accent={t("job")} subtitle={t("Last 6 months")} data={data}
      series={[{ key: "soft", label: t("Soft Booking"), color: STAGE_COLOR.soft, value: String(total(data, "soft")) }, { key: "job", label: t("Job Booking"), color: STAGE_COLOR.job, value: String(total(data, "job")) }, { key: "complete", label: t("Job Complete"), color: STAGE_COLOR.complete, value: String(total(data, "complete")) }]}
      empty={data.every((m) => m.soft + m.job + m.complete === 0)} emptyText={t("No bookings yet.")} note={t("Soft Booking: from a form or the AI agent, not paid yet. Job Booking: a down payment or full payment is in. Job Complete: the job is done and the money is in your wallet.")} />
  );
}

/** Artist revenue: money in escrow, in the wallet (withdrawable) and withdrawn or pending, per month. */
export function RevenueChart({ artistId, wallet }: { artistId: string; wallet: Wallet }) {
  const { t } = useI18n();
  const money = useOverviewMoney(artistId);
  const pct = num(wallet?.commission_pct);
  const data = useMemo(() => {
    const bookings = money.data?.bookings ?? [];
    const payouts = (money.data?.payouts ?? []).filter((p) => p.status === "pending" || p.status === "paid");
    return monthBuckets().map((m, i, all) => {
      const last = i === all.length - 1;
      const E = m.end.getTime();
      const completed = bookings.filter((b) => b.status === "completed" && b.completed_at && new Date(b.completed_at).getTime() <= E).reduce((n, b) => n + num(b.amount), 0);
      const withdrawn = payouts.filter((p) => new Date(p.created_at).getTime() <= E).reduce((n, p) => n + num(p.amount), 0);
      const held = bookings.filter((b) => b.paid_at && new Date(b.paid_at).getTime() <= E && !(b.completed_at && new Date(b.completed_at).getTime() <= E) && !(b.cancelled_at && new Date(b.cancelled_at).getTime() <= E))
        .reduce((n, b) => n + (num(b.total) > 0 ? (num(b.paid_amount) * num(b.amount)) / num(b.total) : 0), 0);
      const available = Math.max(0, completed * (1 - pct / 100) - withdrawn);
      return { label: m.label, escrow: last ? escrowNow(bookings) : held, wallet: last && wallet ? num(wallet.available) : available, withdraw: last && wallet ? num(wallet.paid_out) + num(wallet.pending) : withdrawn };
    });
  }, [money.data, wallet, pct]);
  const now = data[data.length - 1];
  return (
    <AreaCard id="revenue" title={t("Revenue")} accent={t("artist")} subtitle={t("Last 6 months, in AED")} data={data} money
      series={[{ key: "escrow", label: t("Escrow"), color: "#6aa9ff", value: aed(num(now?.escrow)) }, { key: "wallet", label: t("Wallet"), color: "#7bd88f", value: aed(num(now?.wallet)) }, { key: "withdraw", label: t("Withdraw"), color: "#b7a6ff", value: aed(num(now?.withdraw)) }]}
      empty={data.every((m) => m.escrow + m.wallet + m.withdraw === 0)} emptyText={t("Your revenue appears here after your first paid booking.")}
      note={t("Past months are estimated from your bookings and withdrawals. The latest point matches your Wallet.")} />
  );
}
