import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { artistCheckout } from "@/lib/payments.functions";
import { PaymentTestModeBanner, SandboxCheckout, type CheckoutSession } from "@/components/site/SandboxCheckout";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type ItemKind = "agent_prompt" | "flow_template" | "order_form_template";

/**
 * One-time purchase of a library item (AI prompt, flow template, order form template).
 * The price is read from the database on the server; the browser only names the item.
 * Ownership is recorded by the verified payment settlement, never by this component.
 */
export function ItemCheckoutDialog({ kind, itemId, title, priceAed, open, onClose, onPaid }: {
  kind: ItemKind; itemId: string; title: string; priceAed: number; open: boolean; onClose: () => void; onPaid: () => void;
}) {
  const { t } = useI18n();
  const checkout$ = useServerFn(artistCheckout);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!open) { setSession(null); started.current = null; return; }
    if (started.current === itemId) return;
    started.current = itemId;
    setBusy(true);
    checkout$({ data: { kind, itemId } })
      .then((r) => { if ("error" in r) throw new Error(r.error); setSession(r); })
      .catch((e: unknown) => { toast.error(e instanceof Error ? e.message : t("Checkout failed")); onClose(); })
      .finally(() => setBusy(false));
  }, [open, itemId, kind, checkout$, onClose, t]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>AED {(priceAed * 1.05).toFixed(2)} {t("incl. VAT 5%")} · {t("one-time purchase")}</DialogDescription>
        <PaymentTestModeBanner />
        {busy && <p className="text-sm text-muted-foreground">{t("Preparing checkout…")}</p>}
        {session && (
          <SandboxCheckout
            session={session}
            onPaid={() => { setSession(null); toast.success(t("Payment verified. Item unlocked.")); onPaid(); onClose(); }}
          />
        )}
        {!session && !busy && <Button variant="outline" onClick={onClose}>{t("Close")}</Button>}
      </DialogContent>
    </Dialog>
  );
}
