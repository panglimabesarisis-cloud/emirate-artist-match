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

/** Money the artist holds in escrow right now: what clients paid for jobs that are not completed yet, without VAT. */
export function useOverviewMoney(artistId: string) {
  return useQuery({
    queryKey: ["overview-money", artistId],
    refetchInterval: 30000,
    queryFn: async () => {
      const since = new Date(); since.setMonth(since.getMonth() - MONTHS - 1);
      const [b, p, c] = await Promise.all([
        supabase.from("bookings").select("status, amount, total, paid_amount, paid_at, completed_at, cancelled_at, escrow_status").eq("artist_id", artistId).is("deleted_at", null),
        supabase.from("payout_requests").select("amount, status, created_at").eq("artist_id", artistId),
        supabase.from("conversations").select("created_at").eq("artist_id", artistId).gte("created_at", since.toISOString()),
      ]);
      return { bookings: b.data ?? [], payouts: p.data ?? [], chats: c.data ?? [] };
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
    return { key: start.toISOString().slice(0, 7), label: start.toLocaleString("en-GB", { month: "short" }), start, end };
  });
}

const tip = { background: "#0f1424", border: "1px solid rgba(246,239,226,.16)", borderRadius: 12, fontSize: 12, color: "#f6efe2" } as const;
const axis = { fontSize: 11, stroke: "rgba(246,239,226,.4)", tickLine: false, axisLine: false } as const;

function Legend({ items }: { items: Array<{ label: string; value: string; color: string }> }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-2">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2 text-xs text-muted-foreground"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} aria-hidden />{it.label}<b className="font-display text-lg font-normal text-foreground" dir="ltr">{it.value}</b></li>
      ))}
    </ul>
  );
}

/** Left chart: new chats, unpaid invoices and paid invoices per month. */
export function ChatsInvoicesChart({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const money = useOverviewMoney(artistId);
  const inv = useInvoiceQuery(artistId);
  const data = useMemo(() => {
    const buckets = monthBuckets().map((m) => ({ label: m.label, chats: 0, unpaid: 0, paid: 0, start: m.start, end: m.end }));
    const at = (iso: string) => buckets.find((m) => new Date(iso) >= m.start && new Date(iso) <= m.end);
    for (const c of money.data?.chats ?? []) { const m = at(c.created_at); if (m) m.chats += 1; }
    for (const r of inv.data ?? []) { const m = at(r.created_at); if (!m) continue; if (r.status === "paid") m.paid += 1; else m.unpaid += 1; }
    return buckets;
  }, [money.data, inv.data]);
  const sum = (k: "chats" | "unpaid" | "paid") => data.reduce((n, m) => n + m[k], 0);
  const empty = data.every((m) => m.chats + m.unpaid + m.paid === 0);
  return (
    <section className="studio-panel studio-span-6" aria-labelledby="ov-chats">
      <div className="studio-panel-heading"><h2 id="ov-chats">{t("Chats")} <span className="it">{t("and invoices")}</span><small>{t("Last 6 months")}</small></h2></div>
      <Legend items={[{ label: t("Incoming chats"), value: String(sum("chats")), color: "#e8b04a" }, { label: t("Unpaid invoices"), value: String(sum("unpaid")), color: "#e2574c" }, { label: t("Paid invoices"), value: String(sum("paid")), color: "#7bd88f" }]} />
      <div className="relative h-60" role="img" aria-label={t("Chats, unpaid invoices and paid invoices per month")}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <defs>{[["c", "#e8b04a"], ["u", "#e2574c"], ["p", "#7bd88f"]].map(([id, c]) => <linearGradient key={id} id={`g-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity={0.35} /><stop offset="100%" stopColor={c} stopOpacity={0} /></linearGradient>)}</defs>
            <CartesianGrid stroke="rgba(246,239,226,.09)" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="label" tickFormatter={(v: string) => t(v)} {...axis} />
            <YAxis allowDecimals={false} {...axis} />
            <Tooltip contentStyle={tip} cursor={{ stroke: "rgba(246,239,226,.2)" }} />
            <Area type="monotone" dataKey="chats" name={t("Incoming chats")} stroke="#e8b04a" strokeWidth={2} fill="url(#g-c)" />
            <Area type="monotone" dataKey="unpaid" name={t("Unpaid invoices")} stroke="#e2574c" strokeWidth={2} fill="url(#g-u)" />
            <Area type="monotone" dataKey="paid" name={t("Paid invoices")} stroke="#7bd88f" strokeWidth={2} fill="url(#g-p)" />
          </AreaChart>
        </ResponsiveContainer>
        {empty && <p className="pointer-events-none absolute inset-0 grid place-items-center text-center text-sm text-muted-foreground">{t("No chats or invoices yet.")}</p>}
      </div>
    </section>
  );
}

/** Right chart: how much money the artist has in escrow, can withdraw, completed and already withdrawn or pending. */
export function YourBalanceChart({ artistId, wallet }: { artistId: string; wallet: Wallet }) {
  const { t } = useI18n();
  const money = useOverviewMoney(artistId);
  const pct = num(wallet?.commission_pct);
  const data = useMemo(() => {
    const bookings = money.data?.bookings ?? [];
    const payouts = (money.data?.payouts ?? []).filter((p) => p.status === "pending" || p.status === "paid");
    const rows = monthBuckets().map((m, i, all) => {
      const last = i === all.length - 1;
      const E = m.end.getTime();
      const completed = bookings.filter((b) => b.status === "completed" && b.completed_at && new Date(b.completed_at).getTime() <= E).reduce((n, b) => n + num(b.amount), 0);
      const withdrawn = payouts.filter((p) => new Date(p.created_at).getTime() <= E).reduce((n, p) => n + num(p.amount), 0);
      const held = bookings.filter((b) => b.paid_at && new Date(b.paid_at).getTime() <= E && !(b.completed_at && new Date(b.completed_at).getTime() <= E) && !(b.cancelled_at && new Date(b.cancelled_at).getTime() <= E))
        .reduce((n, b) => n + (num(b.total) > 0 ? (num(b.paid_amount) * num(b.amount)) / num(b.total) : 0), 0);
      const available = Math.max(0, completed * (1 - pct / 100) - withdrawn);
      return { label: m.label, escrow: last ? escrowNow(bookings) : held, available: last && wallet ? num(wallet.available) : available, completed: last && wallet ? num(wallet.gross) : completed, withdrawn: last && wallet ? num(wallet.paid_out) + num(wallet.pending) : withdrawn };
    });
    return rows;
  }, [money.data, wallet, pct]);
  const now = data[data.length - 1];
  const empty = data.every((m) => m.escrow + m.available + m.completed + m.withdrawn === 0);
  const series: Array<[keyof Omit<(typeof data)[number], "label">, string, string, string]> = [
    ["escrow", "In escrow", "#6aa9ff", "e"], ["available", "Available to withdraw", "#7bd88f", "a"], ["completed", "Completed work", "#e8b04a", "w"], ["withdrawn", "Withdrawn / pending", "#b7a6ff", "d"],
  ];
  return (
    <section className="studio-panel studio-span-6" aria-labelledby="ov-balance">
      <div className="studio-panel-heading"><h2 id="ov-balance">{t("Your")} <span className="it">{t("Balance")}</span><small>{t("Last 6 months, in AED")}</small></h2></div>
      <Legend items={series.map(([k, label, color]) => ({ label: t(label), value: aed(now?.[k] ?? 0), color }))} />
      <div className="relative h-60" role="img" aria-label={t("Escrow, available to withdraw, completed work and withdrawn or pending per month")}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
            <defs>{series.map(([, , c, id]) => <linearGradient key={id} id={`b-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity={0.3} /><stop offset="100%" stopColor={c} stopOpacity={0} /></linearGradient>)}</defs>
            <CartesianGrid stroke="rgba(246,239,226,.09)" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="label" tickFormatter={(v: string) => t(v)} {...axis} />
            <YAxis {...axis} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}K` : String(v))} />
            <Tooltip contentStyle={tip} cursor={{ stroke: "rgba(246,239,226,.2)" }} formatter={(v: number) => aed(v)} />
            {series.map(([k, label, c, id]) => <Area key={k} type="monotone" dataKey={k} name={t(label)} stroke={c} strokeWidth={2} fill={`url(#b-${id})`} />)}
          </AreaChart>
        </ResponsiveContainer>
        {empty && <p className="pointer-events-none absolute inset-0 grid place-items-center text-center text-sm text-muted-foreground">{t("Your balance appears here after your first paid booking.")}</p>}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{t("Past months are estimated from your bookings and withdrawals. The latest point matches your Wallet.")}</p>
    </section>
  );
}
