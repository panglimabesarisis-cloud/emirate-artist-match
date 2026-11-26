import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { activePurchase, addonKindLabel, addonTotalAed, durationLabel, purchaseState } from "@/lib/addons";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ItemCheckoutDialog } from "./ItemCheckoutDialog";

const day = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" });

/** The artist's add-ons and the ones on sale. Row security returns only the artist's own purchases. */
export function useAddons(artistId: string) {
  return useQuery({
    queryKey: ["artist-addons", artistId],
    queryFn: async () => {
      const [addons, purchases] = await Promise.all([
        supabase.from("addons").select("id, name, kind, description, price_aed, duration_days, active").order("price_aed"),
        supabase.from("addon_purchases").select("id, addon_id, price_aed, paid_at, expires_at, refunded_at, fulfilled_at").eq("artist_id", artistId).order("paid_at", { ascending: false }),
      ]);
      if (addons.error || purchases.error) throw new Error("Unable to load add-ons");
      return { addons: addons.data ?? [], purchases: purchases.data ?? [] };
    },
  });
}
type Offer = NonNullable<ReturnType<typeof useAddons>["data"]>["addons"][number];

/** Buy or renew one add-on. The server reads the price; payment happens on Stripe's page. */
export function AddonCards({ artistId, slug, offers, onAiPage = false }: { artistId: string; slug: string; offers?: (a: Offer) => boolean; onAiPage?: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const query = useAddons(artistId);
  const [buying, setBuying] = useState<Offer | null>(null);
  if (query.error) return <p role="alert" className="text-sm text-destructive">{t("Unable to load add-ons")}</p>;
  if (!query.data) return <p role="status" className="text-sm text-muted-foreground">{t("Loading…")}</p>;
  const { addons, purchases } = query.data;
  const shown = addons.filter((a) => (a.active || activePurchase(purchases, a.id)) && (!offers || offers(a)));
  if (!shown.length) return <p className="text-sm text-muted-foreground">{t("No add-on is on sale yet.")}</p>;
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((a) => {
          const held = activePurchase(purchases, a.id);
          const lasting = !!held && !held.expires_at;
          return (
            <article key={a.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gold">{t(addonKindLabel(a.kind))}</span>
                {held && <span className="rounded-full border border-emerald-400/40 px-2.5 py-0.5 text-xs font-bold text-emerald-300">{t("Active")}</span>}
              </div>
              <h3 className="break-words font-display text-2xl leading-tight" dir="auto">{a.name}</h3>
              <p className="break-words text-sm text-muted-foreground" dir="auto">{a.description}</p>
              <div className="mt-auto">
                <b className="text-lg">AED {addonTotalAed(Number(a.price_aed)).toFixed(2)}</b> <span className="text-xs text-muted-foreground">{t("incl. VAT 5%")} · {t(durationLabel(a.duration_days))}</span>
                {held && <p className="mt-1 text-xs text-muted-foreground">{held.expires_at ? `${t("Active until")} ${day(held.expires_at)}` : t("Yours with no expiry")}{a.kind === "service" && ` · ${t(held.fulfilled_at ? "Delivered" : "Our team will deliver it")}`}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {held && a.kind === "ai_page" && !onAiPage && <Button asChild variant="outline"><a href={`/ai/${slug}`}>{t("Open Personal AI Agent")} <ExternalLink aria-hidden="true" /></a></Button>}
                {a.active && !lasting && <Button className="bg-gradient-gold font-bold text-gold-foreground" onClick={() => setBuying(a)}>{t(held ? "Renew" : "Buy")}</Button>}
              </div>
            </article>
          );
        })}
      </div>
      {buying && <ItemCheckoutDialog kind="addon" itemId={buying.id} title={buying.name} priceAed={Number(buying.price_aed)} term={durationLabel(buying.duration_days)} fromAiPage={onAiPage} open onClose={() => setBuying(null)} onPaid={() => { void qc.invalidateQueries({ queryKey: ["artist-addons", artistId] }); }} />}
    </>
  );
}

export function AddonsPage({ artistId, slug }: { artistId: string; slug: string }) {
  const { t } = useI18n();
  const query = useAddons(artistId);
  const purchases = query.data?.purchases ?? [];
  const name = (id: string) => query.data?.addons.find((a) => a.id === id)?.name ?? t("Add-on");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl">{t("Add-ons")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("Optional extras on top of your plan. Each one is paid separately.")}</p>
      </div>
      <AddonCards artistId={artistId} slug={slug} />
      {purchases.length > 0 && (
        <section className="space-y-2" aria-labelledby="addon-history">
          <h3 id="addon-history" className="font-display text-2xl">{t("Your purchases")}</h3>
          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b text-start text-xs text-muted-foreground"><th className="p-3 text-start">{t("Add-on")}</th><th className="p-3 text-start">{t("Paid")}</th><th className="p-3 text-start">{t("Expires")}</th><th className="p-3 text-end">{t("Price before VAT")}</th><th className="p-3 text-start">{t("Status")}</th></tr></thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-b last:border-0"><td className="p-3">{name(p.addon_id)}</td><td className="p-3">{day(p.paid_at)}</td><td className="p-3">{p.expires_at ? day(p.expires_at) : t("No expiry")}</td><td className="p-3 text-end">AED {Number(p.price_aed).toFixed(2)}</td><td className="p-3 capitalize">{t(purchaseState(p))}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
