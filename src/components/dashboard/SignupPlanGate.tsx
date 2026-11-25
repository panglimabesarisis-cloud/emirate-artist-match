import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { cancelSubscriptionCheckout, checkSubscription, subscriptionCheckout } from "@/lib/billing.functions";
import { readSignupPlan, signupGate, SIGNUP_PLAN_KEY, type PaidSignupPlan, type SignupPlan } from "@/lib/signup-plan";
import { buildReceipt } from "@/lib/receipt";
import { validateHostedUrl } from "@/lib/hosted-checkout";
import { specialtyLimit } from "@/lib/join-rules";
import { aed } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { PublicLayout } from "@/components/site/PublicLayout";
import { PaymentTestModeBanner } from "@/components/site/SandboxCheckout";
import { ReceiptSheet } from "@/components/site/ReceiptSheet";
import { LogoutButton } from "@/components/shared/LogoutButton";
import { Button } from "@/components/ui/button";

type Tier = Tables<"plan_tiers">;
type Interval = "month" | "year";

const priceOf = (tier: Tier, interval: Interval) => Number(interval === "year" ? tier.price_yearly : tier.price_monthly);

async function saveSignup(value: SignupPlan) {
  const { error } = await supabase.auth.updateUser({ data: { [SIGNUP_PLAN_KEY]: value } });
  if (error) throw new Error(error.message);
}

/** Holds the talent dashboard until the subscription step of registration is finished. */
export function SignupPlanGate({ userId, email, children }: { userId: string; email: string; children: ReactNode }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["signup-gate", userId];
  const state = useQuery({
    queryKey: key,
    // A remembered "finish your rate card" answer would bounce a talent who just finished it back to /join.
    gcTime: 0,
    queryFn: async () => {
      const auth = await supabase.auth.getUser();
      if (auth.error) throw new Error(auth.error.message);
      const signup = readSignupPlan(auth.data.user?.user_metadata?.[SIGNUP_PLAN_KEY]);
      const open = { gate: "open" as const, signup, artist: null };
      if (!signup || signup.status === "done") return open;
      const artist = await supabase.from("artists").select("id,stage_name,intended_plan,registration_paid_at").eq("user_id", userId).maybeSingle();
      if (artist.error) throw new Error(artist.error.message);
      if (!artist.data) return open;
      const [rates, plan] = await Promise.all([
        supabase.from("rate_cards").select("id", { count: "exact", head: true }).eq("artist_id", artist.data.id),
        supabase.rpc("effective_artist_plan", { _artist: artist.data.id }),
      ]);
      if (rates.error) throw new Error(rates.error.message);
      if (plan.error) throw new Error(plan.error.message);
      const gate = signupGate({ signup, depositPaid: !!artist.data.registration_paid_at, rateCards: rates.count ?? 0, effectivePlan: plan.data ?? "free" });
      // A verified payment closes the step for good, so a later cancellation does not lock the dashboard again.
      if (gate === "open" && (plan.data ?? "free") !== "free") await saveSignup({ status: "done" });
      return { gate, signup, artist: artist.data };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  if (state.isPending) return <p role="status" className="p-16 text-center text-muted-foreground">{t("Loading…")}</p>;
  // A failed check never locks anyone out: paid features stay limited by the database either way.
  const data = state.data;
  if (!data || data.gate === "open" || !data.artist) return <>{children}</>;
  if (data.gate === "rates") return <Navigate to="/join" replace />;
  return (
    <PublicLayout>
      <PaymentTestModeBanner />
      <div className="flex justify-end p-4"><LogoutButton /></div>
      <main className="mx-auto max-w-5xl space-y-6 px-4 pb-16">
        {data.gate === "pay" && data.signup?.status === "pay"
          ? <PayPlan artist={data.artist} email={email} plan={data.signup.plan} interval={data.signup.interval} onChanged={refresh} />
          : <ChoosePlan artist={data.artist} onChanged={refresh} />}
      </main>
    </PublicLayout>
  );
}

type Artist = { id: string; stage_name: string; intended_plan: string | null };

function useTiers() {
  return useQuery({ queryKey: ["signup-tiers"], queryFn: async () => {
    const { data, error } = await supabase.from("plan_tiers").select("*").order("sort");
    if (error) throw new Error(error.message);
    return data ?? [];
  } });
}

function ChoosePlan({ artist, onChanged }: { artist: Artist; onChanged: () => Promise<unknown> }) {
  const { t } = useI18n();
  const tiers = useTiers();
  const [selected, setSelected] = useState(artist.intended_plan ?? "free");
  const [interval, setInterval] = useState<Interval>("month");
  const [busy, setBusy] = useState(false);
  const tier = tiers.data?.find((x) => x.code === selected);
  const confirm = async () => {
    if (!tier) return;
    setBusy(true);
    try {
      const saved = await supabase.from("artists").update({ intended_plan: tier.code }).eq("id", artist.id);
      if (saved.error) throw new Error(saved.error.message);
      await saveSignup(tier.code === "free" ? { status: "done" } : { status: "pay", plan: tier.code as PaidSignupPlan, interval });
      if (tier.code === "free") toast.success(t("Free plan active. Welcome to your dashboard."));
      await onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-5">
      <header className="text-center">
        <h1 className="text-3xl font-semibold">{t("Step 7 · Subscription")}</h1>
        <p className="mt-2 text-muted-foreground">{t("Choose your plan to open your dashboard. A paid plan opens it after payment; Free opens it now with the Free limits.")}</p>
      </header>
      <div className="flex justify-center gap-2">
        <Button size="sm" variant={interval === "month" ? "default" : "outline"} onClick={() => setInterval("month")}>{t("Monthly")}</Button>
        <Button size="sm" variant={interval === "year" ? "default" : "outline"} onClick={() => setInterval("year")}>{t("Yearly")}</Button>
      </div>
      {tiers.isError && <p role="alert" className="text-center text-destructive">{t("Could not load the plans. Refresh the page.")}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label={t("Choose your plan")}>
        {tiers.data?.map((x) => (
          <button type="button" key={x.code} role="radio" aria-checked={selected === x.code} onClick={() => setSelected(x.code)} className={`rounded-xl border p-4 text-start ${selected === x.code ? "border-gold bg-gold/10" : ""}`}>
            <span className="block text-xl font-semibold">{t(x.name)}</span>
            <span className="mt-1 block text-lg">AED {priceOf(x, interval).toLocaleString("en-US")}<span className="text-sm text-muted-foreground">/{t(interval === "year" ? "yr" : "mo")} + 5% {t("VAT")}</span></span>
            <span className="mt-3 block space-y-1 text-sm text-muted-foreground">
              <span className="block">{x.max_categories} {t("categories")} · {x.max_specialties ?? specialtyLimit(x.code)} {t("specialties")}</span>
              <span className="block">{x.ai_credits} {t("AI credits")}</span>
              <span className="block">{x.max_photos} {t("photos")} · {x.max_videos} {t("videos")}</span>
              <span className="block">{Number(x.commission_pct)}% {t("commission")}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="flex justify-center">
        <Button disabled={busy || !tier} onClick={() => void confirm()} className="h-12 rounded-full bg-gradient-gold px-8 font-bold text-gold-foreground">
          {busy ? t("Saving…") : selected === "free" ? t("Continue with Free") : t("Continue to payment")}
        </Button>
      </div>
    </section>
  );
}

function PayPlan({ artist, email, plan, interval, onChanged }: { artist: Artist; email: string; plan: PaidSignupPlan; interval: Interval; onChanged: () => Promise<unknown> }) {
  const { t } = useI18n();
  const checkout$ = useServerFn(subscriptionCheckout);
  const check$ = useServerFn(checkSubscription);
  const cancel$ = useServerFn(cancelSubscriptionCheckout);
  const tiers = useTiers();
  const tier = tiers.data?.find((x) => x.code === plan);
  const [busy, setBusy] = useState(false);
  const [issued] = useState(() => new Date().toISOString());
  // The server returns the same open checkout when asked again, so reloading keeps one payment link.
  const link = useQuery({
    queryKey: ["signup-checkout", artist.id, plan, interval],
    retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false,
    queryFn: async () => {
      const r = await checkout$({ data: { plan, interval } });
      if ("error" in r) throw new Error(r.error);
      return { url: validateHostedUrl(r.checkoutUrl), sessionId: r.sessionId };
    },
  });
  // A payment that already went through is reported as an error by the server; re-reading the plan unlocks.
  useEffect(() => { if (link.error?.message.includes("payment completed")) void onChanged(); }, [link.error]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); await onChanged(); } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const check = () => run(async () => {
    if (!link.data) return;
    const r = await check$({ data: { sessionId: link.data.sessionId } });
    if ("error" in r) throw new Error(r.error);
    if (r.status !== "paid") toast(t("Payment has not been confirmed yet."));
  });
  const leave = (next: SignupPlan) => run(async () => {
    const r = await cancel$();
    if ("error" in r) throw new Error(r.error);
    if (r.status === "pending") throw new Error(t("Your payment is being confirmed. Check again shortly."));
    // Paid in the meantime: the plan check opens the dashboard, so the new choice is not saved.
    if (r.status === "paid") return;
    if (next.status === "done") {
      const saved = await supabase.from("artists").update({ intended_plan: "free" }).eq("id", artist.id);
      if (saved.error) throw new Error(saved.error.message);
    }
    await saveSignup(next);
  });
  const copy = async () => {
    try { await navigator.clipboard.writeText(link.data!.url); toast.success(t("Payment link copied")); }
    catch { toast.error(t("Could not copy the link")); }
  };

  const total = tier ? Math.round(priceOf(tier, interval) * 1.05 * 100) / 100 : 0;
  const receipt = tier ? buildReceipt({
    reference: artist.id, issued, billTo: artist.stage_name, billEmail: email || null, totalWithVat: total,
    label: `${tier.name} plan subscription`, detail: interval === "year" ? "Billed every year" : "Billed every month",
  }) : null;

  return (
    <section className="space-y-5">
      <header className="text-center">
        <h1 className="text-3xl font-semibold">{t("Your dashboard is locked until payment")}</h1>
        <p className="mt-2 text-muted-foreground">{t("Pay the invoice below to activate your plan, or switch to Free.")}</p>
      </header>
      {receipt ? <ReceiptSheet receipt={receipt} /> : <p role="status" className="text-center">{t("Loading your invoice…")}</p>}
      <div className="space-y-3 text-center">
        {link.isPending ? <p role="status">{t("Preparing your payment link…")}</p>
          : link.data ? <>
            <Button asChild className="h-12 rounded-full bg-gradient-gold px-8 font-bold text-gold-foreground"><a href={link.data.url}>{t("Pay")} {aed(total)} · {t("Stripe test payment")}</a></Button>
            <p className="mx-auto max-w-xl truncate text-xs text-muted-foreground" dir="ltr">{link.data.url}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="outline" onClick={() => void copy()}>{t("Copy payment link")}</Button>
              <Button variant="outline" disabled={busy} onClick={() => void check()}>{t("I have paid · check status")}</Button>
            </div>
          </>
          : <>
            <p role="alert" className="text-destructive">{t(link.error?.message ?? "Checkout unavailable")}</p>
            <Button variant="outline" disabled={link.isFetching} onClick={() => void link.refetch()}>{t("Try again")}</Button>
          </>}
      </div>
      <div className="flex flex-wrap justify-center gap-3 border-t pt-5">
        <Button variant="ghost" disabled={busy || link.isFetching} onClick={() => void leave({ status: "choose" })}>{t("Change plan")}</Button>
        <Button variant="ghost" disabled={busy || link.isFetching} onClick={() => void leave({ status: "done" })}>{t("Use the Free plan instead")}</Button>
      </div>
    </section>
  );
}
