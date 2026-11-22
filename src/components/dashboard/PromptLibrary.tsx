import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { libraryRefresh } from "@/lib/library-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { StudioEmpty } from "./StudioPage";
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
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("on");
  const [buying, setBuying] = useState<Prompt | null>(null);
  const [filter, setFilter] = useState<"all" | "on" | "free" | "paid">("all");
  const prompts = useQuery({
    queryKey: ["agent-prompts"], ...libraryRefresh,
    queryFn: async () => { const { data, error } = await supabase.from("agent_prompts_public").select("id, kind, title, category, description, tier, price_aed").order("title"); if (error) throw error; return (data ?? []) as Prompt[]; },
  });
  const enabled = useQuery({ queryKey: ["agent-prompts-enabled", artistId], ...libraryRefresh, queryFn: async () => new Set(((await supabase.from("agent_prompt_enabled").select("prompt_id").eq("artist_id", artistId)).data ?? []).map((r) => r.prompt_id)) });
  const owned = useQuery({ queryKey: ["agent-prompts-owned", artistId], ...libraryRefresh, queryFn: async () => new Set(((await supabase.from("agent_prompt_purchases").select("prompt_id").eq("artist_id", artistId).not("paid_at", "is", null).is("refunded_at", null)).data ?? []).map((r) => r.prompt_id)) });

  const rank = useMemo(() => new Map((plan.data?.tiers ?? []).map((x) => [x.code, x.sort])), [plan.data]);
  const myRank = rank.get(plan.data?.code ?? "free") ?? 1;
  const max = plan.data?.mine?.max_active_prompts ?? 0;
  const on = enabled.data ?? new Set<string>();
  const have = owned.data ?? new Set<string>();
  const shown = (prompts.data ?? []).filter(p => `${p.title} ${p.description ?? ""}`.toLowerCase().includes(search.toLowerCase())).filter((p) => filter === "all" || (filter === "on" && on.has(p.id)) || (filter === "free" && Number(p.price_aed) === 0) || (filter === "paid" && Number(p.price_aed) > 0)).sort((a, b) => sort === "price" ? Number(a.price_aed) - Number(b.price_aed) : sort === "on" ? Number(on.has(b.id)) - Number(on.has(a.id)) || a.title.localeCompare(b.title) : a.title.localeCompare(b.title));

  const refresh = () => { void qc.invalidateQueries({ queryKey: ["agent-prompts-enabled", artistId] }); void qc.invalidateQueries({ queryKey: ["agent-prompts-owned", artistId] }); };
  const toggle = async (p: Prompt, next: boolean) => {
    const { error } = next
      ? await supabase.from("agent_prompt_enabled").insert({ artist_id: artistId, prompt_id: p.id })
      : await supabase.from("agent_prompt_enabled").delete().eq("artist_id", artistId).eq("prompt_id", p.id);
    if (error) { toast.error(error.message); return; }
    refresh();
  };

  return (
    <section className="dmr-panel dmr-c-12 agent-prompt-panel" aria-label={t("Agent prompts")}>
      <div className="agent-prompt-tools"><div><h2>{t("Agent")} <span className="it">{t("prompts")}</span></h2><span className="text-xs text-muted-foreground">{on.size} / {max < 0 ? "∞" : max} {t("active")}</span></div><div className="flex flex-wrap gap-2"><Input type="search" aria-label={t("Search prompts")} placeholder={t("Search prompts")} value={search} onChange={event => setSearch(event.target.value)} /><div className="agent-pills" role="group" aria-label={t("Filter prompts")}>{(["all", "on", "free", "paid"] as const).map(key => <Button key={key} size="sm" variant="outline" aria-pressed={filter === key} onClick={() => setFilter(key)}>{t({ all: "All", on: "On", free: "Free", paid: "Paid" }[key])}</Button>)}</div><select aria-label={t("Sort prompts")} value={sort} onChange={event => setSort(event.target.value)} className="rounded-xl border border-border bg-card px-3 text-sm"><option value="on">{t("Following first")}</option><option value="az">{t("A to Z")}</option><option value="price">{t("Price low to high")}</option></select></div></div>
      {prompts.error ? <p role="alert" className="p-5 text-destructive">{prompts.error.message}</p> : prompts.isPending ? <p className="p-5 text-sm text-muted-foreground">{t("Loading…")}</p> : shown.length === 0 ? <StudioEmpty title={t("No prompts yet")} /> : <div className="agent-prompt-table"><table><thead><tr>{["Prompt", "Type", "Subscribe", "Price", "Status", "Action"].map(label => <th key={label} scope="col">{t(label)}</th>)}</tr></thead><tbody>{shown.map(p => {
        const price = Number(p.price_aed); const tierLocked = (rank.get(p.tier) ?? 99) > myRank; const needsBuy = price > 0 && !have.has(p.id); const isOn = on.has(p.id); const tierName = plan.data?.tiers.find(x => x.code === p.tier)?.name ?? p.tier;
        return <tr key={p.id}><td><b>{p.title}</b>{p.description && <small>{p.description}</small>}</td><td><Badge variant="outline">{t(p.kind === "know" ? "Knowledge" : "Instruction")}</Badge></td><td><Badge variant="outline">{tierName}</Badge></td><td className="whitespace-nowrap">{price ? `AED ${price.toFixed(2)}` : t("Free")}</td><td><Badge variant={isOn ? "secondary" : "outline"}>{t(isOn ? "Following" : "Off")}</Badge></td><td>{tierLocked ? <span className="inline-flex items-center gap-1 text-xs text-gold"><Lock className="size-3" />{t("Needs")} {tierName}</span> : needsBuy ? <Button size="sm" onClick={() => setBuying(p)}>{t("Buy")} · AED {(price * 1.05).toFixed(2)}</Button> : <Switch checked={isOn} onCheckedChange={checked => void toggle(p, checked)} aria-label={`${t("Turn on")} ${p.title}`} />}</td></tr>;
      })}</tbody></table></div>}
      {buying && <ItemCheckoutDialog kind="agent_prompt" itemId={buying.id} title={buying.title} priceAed={Number(buying.price_aed)} open onClose={() => setBuying(null)} onPaid={refresh} />}
    </section>
  );
}
