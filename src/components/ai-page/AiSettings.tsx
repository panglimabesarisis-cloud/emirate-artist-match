import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BarChart3, Coins, CreditCard, Receipt, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { artistCheckout } from "@/lib/payments.functions";
import { creditUsage } from "@/lib/agent-page";
import { TOPUP_PACKAGES } from "@/lib/masking";
import { orderLabel, receiptNumber } from "@/lib/receipt";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaymentTestModeBanner, SandboxCheckout, type CheckoutSession } from "@/components/site/SandboxCheckout";
import { AddonCards } from "@/components/dashboard/AddonsPage";
import { useOtpGate } from "@/components/shared/OtpGate";

const TABS = [
  ["usage", "Usage Statistik", BarChart3],
  ["topup", "Top Up Kredit", Coins],
  ["account", "Account Setting", User],
  ["payment", "Payment", CreditCard],
  ["billing", "Billing", Receipt],
] as const;
type Tab = (typeof TABS)[number][0];

const REASONS: Record<string, string> = { plan_allocation: "Plan credits", ai_reply: "AI reply", agent_reply: "AI reply", ai_task_settlement: "AI reply", topup_stripe_sandbox: "Top up", topup_test_refund: "Top up refund", topup_demo: "Top-up (demo)" };
const when = (at: string) => new Date(at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });
const day = (at: string) => new Date(at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
const number = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const card = "rounded-[22px] border border-border bg-[linear-gradient(180deg,#0f1426,#0a0e1b)] p-5";

function Head({ title, accent, text }: { title: string; accent?: string; text: string }) {
  const { t } = useI18n();
  return <div><h1 className="font-display text-4xl leading-none">{t(title)} {accent && <span className="it">{t(accent)}</span>}</h1><p className="mt-2 text-sm text-muted-foreground">{t(text)}</p></div>;
}

/** Settings of the AI agent page: usage, top up, account, payment and billing. */
export function AiSettings({ artist, email, userId, onBack }: { artist: { id: string; slug: string; plan: string; trn: string | null }; email: string; userId: string; onBack: () => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("usage");
  const credits = useQuery({
    queryKey: ["ai-page-credits", artist.id],
    queryFn: async () => {
      const [wallet, ledger] = await Promise.all([
        supabase.from("credit_wallets").select("balance,balance_fraction").eq("artist_id", artist.id).maybeSingle(),
        supabase.from("credit_ledger").select("id, created_at, delta, delta_fraction, final_charge_credits, reason").eq("artist_id", artist.id).order("created_at", { ascending: false }).limit(1000),
      ]);
      if (wallet.error || ledger.error) throw new Error("Unable to load credits");
      return { balance: Number(wallet.data?.balance ?? 0) + Number(wallet.data?.balance_fraction ?? 0), usage: creditUsage(ledger.data ?? []) };
    },
  });
  const balance = credits.data ? number(credits.data.balance) : "…";
  return (
    <div className="grid min-h-0 gap-4 p-3 sm:p-5 lg:h-dvh lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav className={`${card} flex min-w-0 flex-col gap-2`} aria-label={t("Settings sections")}>
        <Button type="button" variant="ghost" className="justify-start" onClick={onBack}><ArrowLeft className="h-4 w-4" aria-hidden />{t("Back to chat")}</Button>
        <h2 className="px-3 font-display text-3xl">{t("Settings")}</h2>
        <div className="flex flex-wrap gap-1 lg:flex-col" role="tablist" aria-orientation="vertical">
          {TABS.map(([id, label, Icon]) => (
            <Button key={id} type="button" role="tab" aria-selected={tab === id} variant="ghost" className={`justify-start rounded-xl ${tab === id ? "bg-gradient-gold font-bold text-gold-foreground hover:text-gold-foreground" : "text-muted-foreground"}`} onClick={() => setTab(id)}>
              <Icon className="h-4 w-4" aria-hidden />{t(label)}
            </Button>
          ))}
        </div>
      </nav>
      <section role="tabpanel" className="min-h-0 min-w-0 space-y-4 overflow-y-auto pb-6">
        {credits.error && <p role="alert" className="text-sm text-destructive">{t("Unable to load credits")}</p>}
        {tab === "usage" && <UsageTab balance={balance} usage={credits.data?.usage} />}
        {tab === "topup" && <TopUpTab balance={balance} />}
        {tab === "account" && <AccountTab userId={userId} email={email} artistId={artist.id} trn={artist.trn} />}
        {tab === "payment" && <PaymentTab />}
        {tab === "billing" && <BillingTab artist={artist} />}
      </section>
    </div>
  );
}

function UsageTab({ balance, usage }: { balance: string; usage: ReturnType<typeof creditUsage> | undefined }) {
  const { t } = useI18n();
  const top = Math.max(1, ...(usage?.days.map((d) => d.used) ?? []));
  const show = (n: number | undefined) => (usage ? number(n ?? 0) : "…");
  return (
    <>
      <Head title="Usage" accent="Statistik" text="How many AI replies you have used and how your credits moved." />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[["Credits left", balance], ["AI replies", show(usage?.replies)], ["Credits used", show(usage?.used)], ["Credits bought", show(usage?.bought)]].map(([label, value]) => (
          <div key={label} className={card}><small className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t(label!)}</small><b className="mt-2 block font-display text-4xl font-normal leading-none">{value}</b></div>
        ))}
      </div>
      <div className={card}>
        <h2 className="font-display text-2xl">{t("Last 7")} <span className="it">{t("days")}</span></h2>
        <p className="text-xs text-muted-foreground">{t("Credits used per day.")}</p>
        <ul className="mt-4 flex h-40 items-end gap-2">
          {(usage?.days ?? []).map((d) => (
            <li key={d.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 text-[11px] text-muted-foreground">
              <span>{number(d.used)}</span>
              <span aria-hidden className="w-full max-w-10 rounded-t-md bg-gradient-gold" style={{ height: `${Math.max(2, (d.used / top) * 100)}%` }} />
              <span>{new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short" })}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={card}>
        <h2 className="font-display text-2xl">{t("Recent")} <span className="it">{t("activity")}</span></h2>
        <ul className="mt-3 divide-y divide-border">
          {usage && !usage.recent.length && <li className="py-3 text-sm text-muted-foreground">{t("No credit activity yet.")}</li>}
          {usage?.recent.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span><b>{t(REASONS[r.reason] ?? "Credit adjustment")}</b> <span className="text-xs text-muted-foreground">{when(r.at)}</span></span><span className={r.change > 0 ? "font-bold text-emerald-300" : "font-bold"}>{r.change > 0 ? "+" : ""}{number(r.change)}</span></li>
          ))}
        </ul>
      </div>
    </>
  );
}

function TopUpTab({ balance }: { balance: string }) {
  const { t } = useI18n();
  const checkout$ = useServerFn(artistCheckout);
  const [pack, setPack] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = TOPUP_PACKAGES.find((p) => p.id === pack);
  const pay = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      const r = await checkout$({ data: { kind: "credits", packageId: chosen.id, fromAiPage: true } });
      if ("error" in r) throw new Error(r.error);
      setSession(r);
      setConfirming(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Top-up failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Head title="Top up" accent="kredit" text="Choose a credit pack. Credits are added once the payment is verified." />
      <p className="text-sm">{t("You have")} <b>{balance}</b> {t("AI credits")}.</p>
      <PaymentTestModeBanner />
      {session && <SandboxCheckout session={session} onPaid={() => setSession(null)} />}
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t("Credit packs")}>
        {TOPUP_PACKAGES.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={pack === p.id} onClick={() => setPack(p.id)} className={`${card} text-start transition-colors ${pack === p.id ? "!border-gold" : "hover:!border-gold/50"}`}>
            <b className="block font-display text-4xl font-normal leading-none">{p.credits}</b><span className="text-sm text-muted-foreground">{t("credits")}</span>
            <span className="mt-3 block text-sm font-bold">AED {(p.priceAed * 1.05).toFixed(2)}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button className="bg-gradient-gold font-bold text-gold-foreground" disabled={!chosen} onClick={() => setConfirming(true)}>{t("Continue to payment")} →</Button>
        <span className="text-xs text-muted-foreground">{t("Prices include 5% VAT. Pick a pack first.")}</span>
      </div>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md">
          <DialogTitle>{t("Confirm top up")}</DialogTitle>
          <DialogDescription>{t("You will pay on Stripe's secure checkout page.")}</DialogDescription>
          {chosen && (
            <dl className="space-y-2 text-sm">
              {[["Credits", String(chosen.credits)], ["Price", `AED ${chosen.priceAed.toFixed(2)}`], ["VAT 5%", `AED ${(chosen.priceAed * 0.05).toFixed(2)}`], ["Total", `AED ${(chosen.priceAed * 1.05).toFixed(2)}`]].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{t(k!)}</dt><dd className="font-bold">{v}</dd></div>)}
            </dl>
          )}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirming(false)}>{t("Cancel")}</Button><Button className="bg-gradient-gold font-bold text-gold-foreground" disabled={busy} onClick={() => void pay()}>{t(busy ? "Processing…" : "Pay now")}</Button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AccountTab({ userId, email, artistId, trn }: { userId: string; email: string; artistId: string; trn: string | null }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["ai-page-profile", userId], queryFn: async () => {
    const r = await supabase.from("profiles").select("display_name").eq("id", userId).single();
    if (r.error) throw new Error("Unable to load your account");
    return r.data.display_name ?? "";
  } });
  const [name, setName] = useState("");
  const [tax, setTax] = useState(trn ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (profile.data !== undefined) setName(profile.data); }, [profile.data]);
  const taxBad = !!tax.trim() && !/^\d{15}$/.test(tax.trim());
  const gate = useOtpGate();
  const save = async () => {
    if (!name.trim() || taxBad || busy) return;
    // Changing the account name needs a WhatsApp code.
    if (name.trim() !== profile.data) await gate.run("talent", () => void write());
    else await write();
  };
  const write = async () => {
    setBusy(true);
    const [p, a] = await Promise.all([
      supabase.from("profiles").update({ display_name: name.trim() }).eq("id", userId),
      supabase.from("artists").update({ trn: tax.trim() || null }).eq("id", artistId),
    ]);
    setBusy(false);
    if (p.error || a.error) { toast.error(p.error?.message ?? a.error?.message ?? t("Update failed")); return; }
    toast.success(t("Changes saved"));
    await Promise.all([qc.invalidateQueries({ queryKey: ["ai-page-profile", userId] }), qc.invalidateQueries({ queryKey: ["ai-page-artist"] })]);
  };
  return (
    <>
      <Head title="Account" accent="setting" text="Your name and tax details. Your sign-in email is set when the account is created." />
      {gate.dialog}
      {profile.error && <p role="alert" className="text-sm text-destructive">{t("Unable to load your account")}</p>}
      <form className={`${card} grid gap-4 sm:grid-cols-2`} onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="space-y-1"><Label htmlFor="ai-name">{t("Full name")}</Label><Input id="ai-name" maxLength={80} value={name} disabled={profile.data === undefined} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="ai-email">{t("Sign-in email")}</Label><Input id="ai-email" type="email" readOnly dir="ltr" value={email} /></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="ai-trn">{t("VAT TRN (optional)")}</Label><Input id="ai-trn" inputMode="numeric" maxLength={15} placeholder={t("15-digit tax registration number")} value={tax} aria-invalid={taxBad} onChange={(e) => setTax(e.target.value)} />{taxBad && <p role="alert" className="text-xs text-destructive">{t("A TRN has 15 digits.")}</p>}</div>
        <div className="sm:col-span-2"><Button type="submit" className="bg-gradient-gold font-bold text-gold-foreground" disabled={!name.trim() || taxBad || busy || profile.data === undefined}>{t("Save changes")}</Button></div>
      </form>
    </>
  );
}

function PaymentTab() {
  const { t } = useI18n();
  return (
    <>
      <Head title="Payment" accent="methods" text="How top ups, add-ons and plans are paid." />
      <div className={card}>
        <p className="text-sm">{t("Dealmaker does not store your card. You enter it on Stripe's secure checkout page when you pay.")}</p>
      </div>
    </>
  );
}

function BillingTab({ artist }: { artist: { id: string; slug: string; plan: string } }) {
  const { t } = useI18n();
  const billing = useQuery({ queryKey: ["ai-page-billing", artist.id], queryFn: async () => {
    const [tier, orders] = await Promise.all([
      supabase.from("plan_tiers").select("name, price_monthly").eq("code", artist.plan).maybeSingle(),
      supabase.from("payment_orders").select("id, kind, credits, amount_minor, paid_at, created_at").eq("artist_id", artist.id).in("kind", ["credits", "addon"]).eq("status", "paid").order("created_at", { ascending: false }).limit(100),
    ]);
    if (tier.error || orders.error) throw new Error("Unable to load billing");
    return { tier: tier.data, orders: orders.data ?? [] };
  } });
  const fee = Number(billing.data?.tier?.price_monthly ?? 0);
  return (
    <>
      <Head title="Billing" text="Your plan, add-ons and the receipts you have paid for." />
      {billing.error && <p role="alert" className="text-sm text-destructive">{t("Unable to load billing")}</p>}
      <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <div><small className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("Current plan")}</small><b className="block font-display text-3xl font-normal capitalize">{billing.data?.tier?.name ?? artist.plan}</b>{billing.data && <p className="text-xs text-muted-foreground">{fee > 0 ? `AED ${fee.toFixed(2)} + 5% VAT ${t("per month")}` : t("No monthly fee")}</p>}</div>
        <Button asChild className="bg-gradient-gold font-bold text-gold-foreground"><a href="/dashboard">{t("See plans")} →</a></Button>
      </div>
      <div className="space-y-3"><h2 className="font-display text-2xl">{t("Your")} <span className="it">{t("add-ons")}</span></h2><AddonCards artistId={artist.id} slug={artist.slug} onAiPage /></div>
      <div className={card}>
        <h2 className="font-display text-2xl">{t("Payment")} <span className="it">{t("receipts")}</span></h2>
        {billing.data && !billing.data.orders.length ? <p className="mt-2 text-sm text-muted-foreground">{t("No payment yet.")}</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-2 text-start">{t("Receipt")}</th><th className="py-2 text-start">{t("Date")}</th><th className="py-2 text-start">{t("Item")}</th><th className="py-2 text-end">{t("Paid")}</th></tr></thead>
              <tbody>{billing.data?.orders.map((o) => <tr key={o.id} className="border-b border-border last:border-0"><td className="py-2" dir="ltr">{receiptNumber(o.id)}</td><td className="py-2">{day(o.paid_at ?? o.created_at)}</td><td className="py-2">{t(orderLabel(o.kind, { credits: o.credits }))}</td><td className="py-2 text-end font-bold">AED {(Number(o.amount_minor) / 100).toFixed(2)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
