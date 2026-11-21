import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { StudioEmpty, StudioSection } from "./StudioPage";
import { ItemCheckoutDialog } from "./ItemCheckoutDialog";

type Prompt = { id: string; kind: string; title: string; category: string | null; description: string | null; tier: string; price_aed: number };

/** Plans the artist is on, with the limits the database enforces (tier, purchase, active prompt count). */
export function useArtistPlan(artistId: string) {
  return useQuery({
    queryKey: ["artist-plan-limits", artistId],
    queryFn: async () => {
      const [{ data: code }, { data: tiers }] = await Promise.all([
        supabase.rpc("effective_artist_plan", { _artist: artistId }),
        supabase.from("plan_tiers").select("code, name, sort, max_active_prompts, allowed_models").order("sort"),
      ]);
      const list = tiers ?? [];
      const mine = list.find((x) => x.code === code);
      return { code: String(code ?? "free"), mine, tiers: list };
    },
  });
}

/** Agent prompt library. The prompt text is never sent to the browser: only title, description, tier and price. */
export function PromptLibrary({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const plan = useArtistPlan(artistId);
  const [buying, setBuying] = useState<Prompt | null>(null);
  const [filter, setFilter] = useState<"all" | "on" | "free" | "paid">("all");
  const prompts = useQuery({
    queryKey: ["agent-prompts"],
    queryFn: async () => ((await supabase.from("agent_prompts_public").select("id, kind, title, category, description, tier, price_aed").order("title")).data ?? []) as Prompt[],
  });
  const enabled = useQuery({ queryKey: ["agent-prompts-enabled", artistId], queryFn: async () => new Set(((await supabase.from("agent_prompt_enabled").select("prompt_id").eq("artist_id", artistId)).data ?? []).map((r) => r.prompt_id)) });
  const owned = useQuery({ queryKey: ["agent-prompts-owned", artistId], queryFn: async () => new Set(((await supabase.from("agent_prompt_purchases").select("prompt_id").eq("artist_id", artistId).not("paid_at", "is", null).is("refunded_at", null)).data ?? []).map((r) => r.prompt_id)) });

  const rank = useMemo(() => new Map((plan.data?.tiers ?? []).map((x) => [x.code, x.sort])), [plan.data]);
  const myRank = rank.get(plan.data?.code ?? "free") ?? 1;
  const max = plan.data?.mine?.max_active_prompts ?? 0;
  const on = enabled.data ?? new Set<string>();
  const have = owned.data ?? new Set<string>();
  const shown = (prompts.data ?? []).filter((p) => filter === "all" || (filter === "on" && on.has(p.id)) || (filter === "free" && Number(p.price_aed) === 0) || (filter === "paid" && Number(p.price_aed) > 0));

  const refresh = () => { void qc.invalidateQueries({ queryKey: ["agent-prompts-enabled", artistId] }); void qc.invalidateQueries({ queryKey: ["agent-prompts-owned", artistId] }); };
  const toggle = async (p: Prompt, next: boolean) => {
    const { error } = next
      ? await supabase.from("agent_prompt_enabled").insert({ artist_id: artistId, prompt_id: p.id })
      : await supabase.from("agent_prompt_enabled").delete().eq("artist_id", artistId).eq("prompt_id", p.id);
    if (error) { toast.error(error.message); return; }
    refresh();
  };

  return (
    <StudioSection title="Agent" accent="prompts" className="dmr-c-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("Turn on ready-made instructions and knowledge for your agent. Prompt text stays hidden; your agent follows it below its pricing and safety rules.")}</p>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-border px-3 py-1 text-xs font-bold">{on.size} / {max < 0 ? "∞" : max} {t("active")}</span>
          <div className="flex gap-0.5 rounded-xl bg-foreground/[.04] p-[3px]" role="group" aria-label={t("Filter prompts")}>
            {(["all", "on", "free", "paid"] as const).map((k) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`rounded-[10px] px-3 py-1 text-xs font-semibold ${filter === k ? "bg-foreground text-background" : "text-muted-foreground"}`}>{t({ all: "All", on: "On", free: "Free", paid: "Paid" }[k])}</button>)}
          </div>
        </div>
      </div>
      {prompts.isPending ? <p className="text-sm text-muted-foreground">{t("Loading…")}</p> : shown.length === 0 ? <StudioEmpty title={t("No prompts yet")} /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((p) => {
            const price = Number(p.price_aed);
            const tierLocked = (rank.get(p.tier) ?? 99) > myRank;
            const needsBuy = price > 0 && !have.has(p.id);
            const isOn = on.has(p.id);
            const tierName = plan.data?.tiers.find((x) => x.code === p.tier)?.name ?? p.tier;
            return (
              <li key={p.id} className="flex flex-col gap-2 rounded-2xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <b className="block truncate">{p.title}</b>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{p.kind === "know" ? t("Knowledge") : t("Instruction")}</Badge>
                      {p.category && <Badge variant="outline">{p.category}</Badge>}
                      {p.tier !== "free" && <Badge variant="outline">{tierName}+</Badge>}
                      {price > 0 && <Badge className="bg-gold/20 text-gold">AED {price.toFixed(0)}</Badge>}
                    </div>
                  </div>
                  {!tierLocked && !needsBuy && <Switch checked={isOn} onCheckedChange={(c) => void toggle(p, c)} aria-label={`${t("Turn on")} ${p.title}`} />}
                </div>
                {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                <div className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" aria-hidden />{t("Prompt text hidden")}
                  {tierLocked && <span className="ms-auto text-gold">{t("Needs")} {tierName}</span>}
                  {!tierLocked && needsBuy && <Button size="sm" className="ms-auto bg-gradient-gold text-gold-foreground" onClick={() => setBuying(p)}>{t("Buy")} · AED {(price * 1.05).toFixed(2)}</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {buying && <ItemCheckoutDialog kind="agent_prompt" itemId={buying.id} title={buying.title} priceAed={Number(buying.price_aed)} open onClose={() => setBuying(null)} onPaid={refresh} />}
    </StudioSection>
  );
}
