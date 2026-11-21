import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StudioSection } from "./StudioPage";
import { ItemCheckoutDialog } from "./ItemCheckoutDialog";
import { useArtistPlan } from "./PromptLibrary";

type Tpl = { id: string; name: string; category: string | null; description: string | null; tier: string; price_aed: number; question_count: number | null };

/** Ready-made order forms. Questions stay hidden until the template is free or bought; using one copies it into your form. */
export function FormTemplates({ artistId, onUsed }: { artistId: string; onUsed: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const plan = useArtistPlan(artistId);
  const [buying, setBuying] = useState<Tpl | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["form-templates"],
    queryFn: async () => ((await supabase.from("order_form_templates_public").select("id, name, category, description, tier, price_aed, question_count").order("name")).data ?? []) as Tpl[],
  });
  const owned = useQuery({
    queryKey: ["form-templates-owned", artistId],
    queryFn: async () => new Set(((await supabase.from("order_form_template_purchases").select("template_id").eq("artist_id", artistId).not("paid_at", "is", null).is("refunded_at", null)).data ?? []).map((r) => r.template_id)),
  });
  const rank = new Map((plan.data?.tiers ?? []).map((x) => [x.code, x.sort]));
  const myRank = rank.get(plan.data?.code ?? "free") ?? 1;
  const have = owned.data ?? new Set<string>();

  const use = async (tpl: Tpl) => {
    if (!confirm(t("This replaces your current order form questions. Continue?"))) return;
    setBusy(tpl.id);
    const { error } = await supabase.rpc("use_order_form_template", { _id: tpl.id });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(t("Template applied to your order form"));
    void qc.invalidateQueries({ queryKey: ["order-form", artistId] });
    onUsed();
  };

  if (!list.data?.length) return null;
  return (
    <StudioSection title="Form" accent="templates">
      <ul className="grid gap-3 md:grid-cols-2">
        {list.data.map((tpl) => {
          const price = Number(tpl.price_aed);
          const tierLocked = (rank.get(tpl.tier) ?? 99) > myRank;
          const needsBuy = price > 0 && !have.has(tpl.id);
          const tierName = plan.data?.tiers.find((x) => x.code === tpl.tier)?.name ?? tpl.tier;
          return (
            <li key={tpl.id} className="flex flex-col gap-2 rounded-2xl border border-border p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gold/10 text-gold"><ClipboardList className="h-4 w-4" aria-hidden /></span>
                <div className="min-w-0">
                  <b className="block truncate">{tpl.name}</b>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {tpl.category && <Badge variant="outline">{tpl.category}</Badge>}
                    <Badge variant="secondary">{tpl.question_count ?? 0} {t("questions")}</Badge>
                    {tpl.tier !== "free" && <Badge variant="outline">{tierName}+</Badge>}
                    {price > 0 && <Badge className="bg-gold/20 text-gold">AED {price.toFixed(0)}</Badge>}
                  </div>
                </div>
              </div>
              {tpl.description && <p className="text-xs text-muted-foreground">{tpl.description}</p>}
              <div className="mt-auto flex justify-end pt-1">
                {tierLocked ? <span className="text-xs text-gold">{t("Needs")} {tierName}</span>
                  : needsBuy ? <Button size="sm" className="bg-gradient-gold text-gold-foreground" onClick={() => setBuying(tpl)}>{t("Buy")} · AED {(price * 1.05).toFixed(2)}</Button>
                  : <Button size="sm" variant="outline" disabled={busy === tpl.id} onClick={() => void use(tpl)}>{busy === tpl.id ? t("Applying…") : t("Use template")}</Button>}
              </div>
            </li>
          );
        })}
      </ul>
      {buying && <ItemCheckoutDialog kind="order_form_template" itemId={buying.id} title={buying.name} priceAed={Number(buying.price_aed)} open onClose={() => setBuying(null)} onPaid={() => { void qc.invalidateQueries({ queryKey: ["form-templates-owned", artistId] }); }} />}
    </StudioSection>
  );
}
