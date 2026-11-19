import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Lock, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { subscribePlanDemo } from "@/lib/chat.functions";
import { joinPaymentTotal } from "@/lib/join-rules";

export const Route = createFileRoute("/join_/payment")({
  head: () => ({
    meta: [
      { title: "Activate your talent plan | Dealmaker" },
      { name: "description", content: "Pay your Dealmaker talent plan deposit by card to activate your profile." },
      { property: "og:title", content: "Activate your talent plan | Dealmaker" },
      { property: "og:description", content: "Secure card payment to activate your Dealmaker talent profile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentPage,
});

const aed = (n: number) => `AED ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PaymentPage() {
  const pay$ = useServerFn(subscribePlanDemo);
  const [plan, setPlan] = useState<string | null>(null);
  const [card, setCard] = useState({ number: "", exp: "", cvc: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  useEffect(() => { setPlan(localStorage.getItem("join_plan") ?? "free"); }, []);
  const tier = useQuery({
    queryKey: ["join-pay-tier", plan], enabled: !!plan,
    queryFn: async () => (await supabase.from("plan_tiers").select("*").eq("code", plan!).maybeSingle()).data,
  }).data;
  const t = joinPaymentTotal();
  const free = false;
  const paidPlan = plan && plan !== "free";

  const fmtNum = (v: string) => v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  const fmtExp = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };

  const pay = async () => {
    if (!free) {
      if (card.number.replace(/\s/g, "").length !== 16 || !/^\d{2}\/\d{2}$/.test(card.exp) || card.cvc.length < 3 || !card.name.trim()) { toast.error("Please complete your card details."); return; }
      if (card.number.replace(/\s/g, "") === "4000000000000002") { toast.error("Your card was declined. (demo)"); return; }
    }
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 1500));
      if (paidPlan) await pay$({ data: { code: plan, cycle: "monthly" } });
      localStorage.removeItem("join_plan");
      setReceipt(`DM-PAY-${Date.now().toString(36).toUpperCase()}`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <PublicLayout>
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-6 rounded-lg border border-gold/50 bg-gold/10 px-4 py-2 text-center text-sm">Demo mode — no real money is charged. Test card: 4242 4242 4242 4242.</div>
        {receipt ? (
          <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-gold" />
            <h1 className="mt-3 text-2xl font-semibold">Payment successful</h1>
            <p className="mt-1 text-muted-foreground">{tier?.name} plan activated. Your profile is now waiting for our team's review.</p>
            <div className="mt-5 space-y-1 rounded-xl border p-4 text-start text-sm">
              <div className="flex justify-between"><span>Reference</span><b>{receipt}</b></div>
              <div className="flex justify-between"><span>Amount paid</span><b>{aed(t.total)}</b></div>
              <div className="flex justify-between"><span>AI credits added</span><b>{paidPlan ? tier?.ai_credits : 0}</b></div>
            </div>
            <Button asChild className="mt-6 w-full bg-gradient-gold text-gold-foreground"><Link to="/dashboard">Go to talent dashboard</Link></Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-5">
            <div className="rounded-2xl border bg-card p-6 md:col-span-2">
              <h2 className="font-semibold">Order summary</h2>
              <p className="mt-1 text-sm text-muted-foreground">{tier?.name ?? "…"} plan · registration deposit</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span>Registration deposit</span><span>{aed(t.subtotal)}</span></div>
                <div className="flex justify-between"><span>VAT 5%</span><span>{aed(t.vat)}</span></div>
                <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span>{aed(t.total)}</span></div>
              </div>
              <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
                <li>{tier?.ai_credits} AI credits</li>
                <li>{tier?.max_photos} photos · {tier?.max_videos} videos</li>
                <li>{Number(tier?.commission_pct ?? 0)}% platform commission</li>
              </ul>
            </div>
            <div className="rounded-2xl border bg-card p-6 md:col-span-3">
              <h1 className="flex items-center gap-2 text-xl font-semibold"><CreditCard className="h-5 w-5" /> {free ? "Activate your profile" : "Pay with card"}</h1>
              {free ? <p className="mt-2 text-sm text-muted-foreground">The Free plan has no charge. Activate to finish your registration.</p> : (
                <div className="mt-4 space-y-3">
                  <div><Label>Card number</Label><Input inputMode="numeric" placeholder="1234 1234 1234 1234" value={card.number} onChange={(e) => setCard({ ...card, number: fmtNum(e.target.value) })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Expiry</Label><Input placeholder="MM/YY" value={card.exp} onChange={(e) => setCard({ ...card, exp: fmtExp(e.target.value) })} /></div>
                    <div><Label>CVC</Label><Input inputMode="numeric" placeholder="123" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} /></div>
                  </div>
                  <div><Label>Name on card</Label><Input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} /></div>
                  <button type="button" className="text-xs underline text-muted-foreground" onClick={() => setCard({ number: "4242 4242 4242 4242", exp: "12/30", cvc: "123", name: card.name || "Test Talent" })}>Fill test card</button>
                </div>
              )}
              <Button type="button" disabled={busy || !tier} onClick={pay} className="mt-5 h-11 w-full bg-gradient-gold text-gold-foreground">
                {busy ? "Processing payment…" : free ? "Activate profile" : `Pay ${aed(t.total)}`}
              </Button>
              <p className="mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Secure checkout · Powered by Stripe (demo)</p>
            </div>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
