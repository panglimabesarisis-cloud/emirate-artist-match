import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Search } from "lucide-react";
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
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [tier, setTier] = useState("");
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

  const all = list.data ?? [];
  const cats = [...new Set(all.map((x) => x.category).filter(Boolean) as string[])].sort();
  const needle = q.trim().toLowerCase();
  const shown = all.filter((x) => (!cat || x.category === cat) && (!tier || x.tier === tier) && (!needle || `${x.name} ${x.description ?? ""} ${x.category ?? ""}`.toLowerCase().includes(needle)));
  const sel = "h-10 rounded-xl border border-border bg-foreground/[.05] px-3 pe-7 text-[13px] font-bold";
  return (
    <StudioSection title="Form" accent="templates" subtitle="Made by Dealmaker. Pick one to fill your form, then change anything.">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="relative flex h-10 min-w-48 max-w-xs flex-1 items-center"><Search className="pointer-events-none absolute start-3.5 h-4 w-4 text-gold" aria-hidden /><span className="sr-only">{t("Search templates")}</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search templates")} autoComplete="off" className="h-full w-full rounded-[14px] border border-border bg-foreground/[.03] pe-3 ps-10 text-sm outline-none focus-visible:border-gold" /></label>
        <label><span className="sr-only">{t("Category")}</span><select value={cat} onChange={(e) => setCat(e.target.value)} className={sel}><option value="">{t("All categories")}</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label><span className="sr-only">{t("Plan")}</span><select value={tier} onChange={(e) => setTier(e.target.value)} className={sel}><option value="">{t("All plans")}</option>{(plan.data?.tiers ?? []).map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select></label>
      </div>
      {shown.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center"><span className="grid h-[60px] w-[60px] place-items-center rounded-full border border-gold/25 bg-[radial-gradient(circle,rgba(232,176,74,.22),rgba(232,176,74,.04)_70%)] text-gold"><ClipboardList className="h-[22px] w-[22px]" /></span><b className="font-display text-2xl font-normal">{t("No templates found")}</b><p className="text-[13px] text-muted-foreground">{t("Try another search or plan.")}</p></div>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {shown.map((tpl) => {
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
