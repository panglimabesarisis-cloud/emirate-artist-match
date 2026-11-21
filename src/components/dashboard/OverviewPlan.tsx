import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { initials } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { BillingPanel } from "./BillingPanel";
import { TopUpPanel } from "./TopUpPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PlanModal = "plan" | "upgrade" | "topup" | null;

const DAY = 86_400_000;
type Slice = { key: string; label: string; n: number; color: string; amount: number | null };

/** Everything the Overview plan panel and its windows need, read through the artist's own RLS. */
function usePlanOverview(artistId: string, fallbackPlan: string) {
  return useQuery({
    queryKey: ["overview-plan", artistId],
    queryFn: async () => {
      const [tiers, subs, wallet, convs, invoices, eff] = await Promise.all([
        supabase.from("plan_tiers").select("*").order("sort"),
        supabase
          .from("artist_subscriptions")
          .select("*")
          .eq("artist_id", artistId)
          .eq("environment", "sandbox")
          .order("created_at", { ascending: false }),
        supabase.from("credit_wallets").select("balance").eq("artist_id", artistId).maybeSingle(),
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("artist_id", artistId),
        supabase
          .from("service_invoices")
          .select("id, total, status, bookings(paid_amount)")
          .eq("artist_id", artistId),
        supabase.rpc("effective_artist_plan", { _artist: artistId }),
      ]);
      for (const r of [tiers, subs, wallet, convs, invoices, eff])
        if (r.error) throw new Error(r.error.message);
      const code = eff.data ?? fallbackPlan;
      const tier = (tiers.data ?? []).find((x) => x.code === code);
      const sub = (subs.data ?? []).find(
        (s) => !["canceled", "incomplete_expired"].includes(s.status),
      );
      const counts = {
        paid: { n: 0, amount: 0 },
        partial: { n: 0, amount: 0 },
        unpaid: { n: 0, amount: 0 },
      };
      for (const row of invoices.data ?? []) {
        const total = Number(row.total);
        const bk = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
        const paid = bk
          ? Math.min(total, Number(bk.paid_amount))
          : row.status === "paid"
            ? total
            : 0;
        const k = paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
        counts[k].n += 1;
        counts[k].amount += total;
      }
      return {
        code,
        tier,
        sub,
        credits: wallet.data?.balance ?? 0,
        chats: convs.count ?? 0,
        counts,
      };
    },
  });
}

function Bar({
  label,
  value,
  pct,
  hint,
  low,
  none,
}: {
  label: string;
  value: string;
  pct: number;
  hint: string;
  low?: boolean;
  none?: boolean;
}) {
  const fill = low ? "var(--studio-low-gradient)" : "var(--gradient-gold)";
  return (
    <div>
      <div className="mb-2 flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{label}</span>
        <b className="font-semibold tabular-nums text-foreground">{value}</b>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-foreground/10"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${none ? "opacity-30" : ""}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: fill }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground/80">{hint}</p>
    </div>
  );
}

function usePlanView(artistId: string, plan: string) {
  const { t } = useI18n();
  const q = usePlanOverview(artistId, plan);
  const d = q.data;
  const periodEnd = d?.sub ? new Date(d.sub.paid_until ?? d.sub.period_end) : null;
  const periodStart = d?.sub ? new Date(d.sub.period_start) : null;
  const total =
    periodEnd && periodStart
      ? Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / DAY))
      : 0;
  const left = periodEnd ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / DAY)) : 0;
  const allowance = d?.tier?.ai_credits ?? 0;
  const credits = d?.credits ?? 0;
  const name = d?.tier?.name ?? plan;
  const bars = !d ? (
    <div className="h-28 animate-pulse rounded-xl bg-foreground/5" aria-busy="true" />
  ) : (
    <div className="space-y-5">
      {d?.sub && periodEnd ? (
        <Bar
          label={t("Subscription")}
          value={`${left} ${left === 1 ? t("day left") : t("days left")}`}
          pct={(left / total) * 100}
          low={left <= 7}
          hint={`${name} ${t("plan, expires on")} ${periodEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
        />
      ) : (
        <Bar
          label={t("Subscription")}
          value={t("No subscription")}
          pct={100}
          none
          hint={t("The Free plan never expires. Upgrade to start a subscription.")}
        />
      )}
      <Bar
        label={t("AI credits")}
        value={`${credits.toLocaleString("en-US")} ${t("credits")}`}
        pct={allowance ? (credits / allowance) * 100 : credits > 0 ? 100 : 0}
        low={credits < 20}
        hint={`${t("Your")} ${name} ${t("plan adds")} ${allowance} ${t("credits a month. Top ups never expire.")}`}
      />
    </div>
  );
  return { q, d, name, bars, periodEnd };
}

function Donut({ d }: { d: NonNullable<ReturnType<typeof usePlanOverview>["data"]> }) {
  const { t } = useI18n();
  const slices: Slice[] = [
    { key: "chats", label: t("Incoming chats"), n: d.chats, color: "var(--chart-2)", amount: null },
    {
      key: "unpaid",
      label: t("Unpaid invoices"),
      n: d.counts.unpaid.n,
      color: "var(--chart-4)",
      amount: d.counts.unpaid.amount,
    },
    {
      key: "partial",
      label: t("Partial invoices"),
      n: d.counts.partial.n,
      color: "var(--chart-1)",
      amount: d.counts.partial.amount,
    },
    {
      key: "paid",
      label: t("Paid invoices"),
      n: d.counts.paid.n,
      color: "var(--chart-3)",
      amount: d.counts.paid.amount,
    },
  ];
  const total = slices.reduce((a, s) => a + s.n, 0);
  const live = slices.filter((s) => s.n > 0);
  let offset = 0;
  return (
    <div className="border-t border-dashed pt-4">
      <div className="mb-3 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
        {t("Inbox and invoices")}
      </div>
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-[150px]">
          <svg
            viewBox="0 0 36 36"
            className="size-full -rotate-90"
            role="img"
            aria-label={t("Incoming chats and invoices by payment status")}
          >
            <circle
              cx="18"
              cy="18"
              r="15.9155"
              fill="none"
              strokeWidth="4.4"
              stroke="var(--studio-ring-track)"
            />
            {total > 0 &&
              live.map((s) => {
                const pct = (s.n / total) * 100;
                const len = Math.max(0, pct - (live.length > 1 ? 1.2 : 0));
                const el = (
                  <circle
                    key={s.key}
                    cx="18"
                    cy="18"
                    r="15.9155"
                    fill="none"
                    strokeWidth="4.4"
                    stroke={s.color}
                    strokeDasharray={`${len.toFixed(2)} ${(100 - len).toFixed(2)}`}
                    strokeDashoffset={(-offset).toFixed(2)}
                  />
                );
                offset += pct;
                return el;
              })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <b className="font-display text-4xl leading-none">{total}</b>
            <small className="text-[10.5px] text-muted-foreground">{t("items")}</small>
          </div>
        </div>
        <ul className="grid w-full grid-flow-col grid-cols-2 grid-rows-2 gap-x-4">
          {slices.map((s) => (
            <li
              key={s.key}
              className="grid grid-cols-[10px_1fr] items-center gap-x-2 border-t border-dashed py-2 text-xs first:border-t-0 [&:nth-child(3)]:border-t-0"
            >
              <i className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
              <span>{s.label}</span>
              <em className="col-start-2 text-[15px] font-extrabold not-italic tabular-nums">
                {s.n}
                {s.amount != null && (
                  <small className="ms-2 text-[11px] font-medium text-muted-foreground">
                    {t("AED")} {Math.round(s.amount).toLocaleString("en-US")}
                  </small>
                )}
              </em>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The "Your plan" card on the Overview page. */
export function OverviewPlan({
  artistId,
  stageName,
  plan,
  openModal,
}: {
  artistId: string;
  stageName: string;
  plan: string;
  openModal: (m: PlanModal) => void;
}) {
  const { t } = useI18n();
  const { d, name, bars } = usePlanView(artistId, plan);
  return (
    <section className="studio-panel studio-plan studio-span-4" aria-labelledby="ov-plan-h">
      <div className="studio-plan-heading">
        <h2 id="ov-plan-h" className="text-3xl leading-none">
          {t("Your")} <span className="it">{t("plan")}</span>
        </h2>
        <p className="mt-1.5 text-xs text-muted-foreground">{t("Subscription and AI credits")}</p>
      </div>
      <div className="flex items-center gap-3.5">
        <div
          className="grid size-[60px] shrink-0 place-items-center rounded-full border bg-secondary font-display text-2xl tracking-wide text-gold"
          aria-hidden="true"
        >
          {initials(stageName)}
        </div>
        <div>
          <b className="block text-base font-bold">{stageName}</b>
          <Badge variant="secondary" className="mt-1.5 uppercase">
            {t(name)} {t("plan")}
          </Badge>
        </div>
      </div>
      {bars}
      <div className="grid grid-cols-2 gap-2.5">
        <Button
          variant="outline"
          className="hover:bg-gradient-gold hover:text-gold-foreground"
          onClick={() => openModal("upgrade")}
        >
          {t("Upgrade plan")}
        </Button>
        <Button
          variant="outline"
          className="hover:bg-gradient-gold hover:text-gold-foreground"
          onClick={() => openModal("topup")}
        >
          {t("Top up credits")}
        </Button>
      </div>
      {d && <Donut d={d} />}
    </section>
  );
}

/** The three windows opened from the Overview buttons. Upgrade reuses BillingPanel, so checkout, proration and verified settlement stay in one place. */
export function PlanDialogs({
  artistId,
  plan,
  open,
  setOpen,
}: {
  artistId: string;
  plan: string;
  open: PlanModal;
  setOpen: (m: PlanModal) => void;
}) {
  const { t } = useI18n();
  const { d, name, bars } = usePlanView(artistId, plan);
  const features = Array.isArray(d?.tier?.features)
    ? d.tier.features.filter((x): x is string => typeof x === "string")
    : [];
  const onOpenChange = (m: PlanModal) => (v: boolean) => {
    if (!v && open === m) setOpen(null);
  };
  return (
    <>
      <Dialog open={open === "plan"} onOpenChange={onOpenChange("plan")}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-4xl leading-none">
              {t("Your plan is")} <span className="it">{name}</span>
            </DialogTitle>
            <DialogDescription>
              {d?.sub
                ? t("Your subscription is active.")
                : t("You are on the free plan. It never expires.")}
            </DialogDescription>
          </DialogHeader>
          {bars}
          {features.length > 0 && (
            <ul className="space-y-2 text-sm">
              {features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-gold">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen("topup")}>
              {t("Top up credits")}
            </Button>
            <Button
              className="bg-gradient-gold text-gold-foreground"
              onClick={() => setOpen("upgrade")}
            >
              {t("Upgrade plan")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={open === "upgrade"} onOpenChange={onOpenChange("upgrade")}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-4xl leading-none">
              {t("Upgrade")} <span className="it">{t("plan")}</span>
            </DialogTitle>
            <DialogDescription>
              {t(
                "More AI credits, more photos and videos, more specialities and smarter AI models.",
              )}
            </DialogDescription>
          </DialogHeader>
          <BillingPanel artistId={artistId} />
        </DialogContent>
      </Dialog>
      <Dialog open={open === "topup"} onOpenChange={onOpenChange("topup")}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-4xl leading-none">
              {t("Top up")} <span className="it">{t("credits")}</span>
            </DialogTitle>
            <DialogDescription>
              {t("1 credit = 1 AI reply. Clients never pay for AI. Credits you buy do not expire.")}
            </DialogDescription>
          </DialogHeader>
          <TopUpPanel artistId={artistId} onDone={() => setOpen(null)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
