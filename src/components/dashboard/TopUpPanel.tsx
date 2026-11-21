import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { artistCheckout } from "@/lib/payments.functions";
import {
  SandboxCheckout,
  PaymentTestModeBanner,
  type CheckoutSession,
} from "@/components/site/SandboxCheckout";
import { TOPUP_PACKAGES } from "@/lib/masking";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

/** Credit packs and the sandbox checkout. Used in the Overview top up window. Credits are added only by the verified payment settlement. */
export function TopUpPanel({ artistId, onDone }: { artistId: string; onDone?: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const top$ = useServerFn(artistCheckout);
  const [checkout, setCheckout] = useState<CheckoutSession | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const buy = async (id: string) => {
    setBusy(id);
    try {
      const r = await top$({ data: { kind: "credits", packageId: id } });
      if ("error" in r) throw new Error(r.error);
      setCheckout(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Top-up failed"));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-4">
      <PaymentTestModeBanner />
      {checkout ? (
        <SandboxCheckout
          session={checkout}
          onPaid={() => {
            setCheckout(null);
            toast.success(t("Payment verified. Credits added."));
            void qc.invalidateQueries({ queryKey: ["wallet", artistId] });
            void qc.invalidateQueries({ queryKey: ["overview-plan", artistId] });
            void qc.invalidateQueries({ queryKey: ["artist-overview", artistId] });
            onDone?.();
          }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {TOPUP_PACKAGES.map((p) => (
            <div key={p.id} className="rounded-2xl border bg-card p-4">
              <div className="font-display text-4xl leading-none">{p.credits}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t("credits")}</div>
              <div className="mt-3 text-sm font-semibold">
                AED {(p.priceAed * 1.05).toFixed(2)} {t("incl. VAT 5%")}
              </div>
              <div className="text-xs text-muted-foreground">
                AED {(p.priceAed / p.credits).toFixed(3)} {t("per credit before VAT")}
              </div>
              <Button
                className="mt-4 h-auto min-h-9 w-full whitespace-normal bg-gradient-gold text-gold-foreground"
                disabled={busy !== null}
                onClick={() => void buy(p.id)}
              >
                {busy === p.id ? t("Processing…") : t("Buy · Stripe sandbox")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
