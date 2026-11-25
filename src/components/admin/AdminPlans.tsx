import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AI_MODELS, PLAN_LIMITS, planProblem } from "@/lib/admin-artists";
import { useArtistStats, usePlans } from "./artists/data";
import { ListState } from "./artists/parts";

type Row = NonNullable<ReturnType<typeof usePlans>["data"]>[number];
type Plan = Omit<Row, "features" | "allowed_models"> & { features: string[]; allowed_models: string[] };
const toPlan = (row: Row): Plan => ({ ...row, features: Array.isArray(row.features) ? (row.features as string[]) : [], allowed_models: Array.isArray(row.allowed_models) ? row.allowed_models : [] });
const GROUPS = [...new Set(PLAN_LIMITS.map((l) => l.group))];

/** Every package with all of its entitlements, edited and saved on its own card. */
export function AdminPlans() {
  const query = usePlans();
  const stats = useArtistStats().data;
  const subscribers = (code: string) => (stats ? [...stats.values()].filter((s) => s.plan_code === code).length : null);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Saved values apply to the artist dashboard, registration and checkout. New AI credit amounts start with the next monthly allocation.</p>
      <ListState pending={query.isPending} error={query.error} empty={query.data?.length ? null : "No package found."}>
        <div className="adm-grid">{query.data?.map((row) => <PlanCard key={row.code} plan={toPlan(row)} count={subscribers(row.code)} />)}</div>
      </ListState>
    </div>
  );
}

function PlanCard({ plan, count }: { plan: Plan; count: number | null }) {
  const qc = useQueryClient();
  const saved = JSON.stringify(plan);
  const [p, setP] = useState(plan);
  const [feature, setFeature] = useState("");
  const [busy, setBusy] = useState(false);
  // A reload replaces the form only when the stored package actually changed.
  useEffect(() => { setP(JSON.parse(saved) as Plan); }, [saved]);
  const dirty = JSON.stringify(p) !== saved;
  const addFeature = () => { if (!feature.trim()) return; setP({ ...p, features: [...p.features, feature.trim()] }); setFeature(""); };
  const number = (key: "price_monthly" | "price_yearly" | (typeof PLAN_LIMITS)[number]["key"], label: string, min: number) => (
    <label key={key}>{label}<Input type="number" min={min} value={Number.isNaN(p[key]) ? "" : p[key]} onChange={(e) => setP({ ...p, [key]: e.target.value === "" ? Number.NaN : Number(e.target.value) })} /></label>
  );
  const save = async () => {
    const next = { ...p, name: p.name.trim(), features: p.features.map((f) => f.trim()).filter(Boolean) };
    const problem = planProblem(next);
    if (problem) { toast.error(problem); return; }
    setBusy(true);
    const { code, sort: _sort, updated_at: _updated, ...values } = next;
    // The returned row proves the change was stored; a refused update returns none.
    const { data, error } = await supabase.from("plan_tiers").update({ ...values, updated_at: new Date().toISOString() }).eq("code", code).select("code");
    setBusy(false);
    if (error || !data?.length) { toast.error(error?.message ?? "The package was not saved"); return; }
    toast.success(`${next.name} saved`);
    await Promise.all(["admin-plans", "join-plans", "join-plan-limit", "plan-limits"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
  };
  return (
    <section className="adm-card" aria-label={`${plan.name} package`}>
      <div className="adm-body">
        <div className="adm-title"><span className="adm-heading">{p.code}</span><span className="adm-pill is-badge">{count === null ? "…" : count} artists</span></div>
        <Input aria-label="Package name" className="font-display !text-2xl" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        <div className="adm-matrix">
          {number("price_monthly", "Price per month (AED)", 0)}
          {number("price_yearly", "Price per year (AED)", 0)}
          {GROUPS.map((group) => <Fragment key={group}><h3 className="adm-heading pt-3">{group}</h3>{PLAN_LIMITS.filter((l) => l.group === group).map((l) => number(l.key, l.label, l.min))}</Fragment>)}
          <h3 className="adm-heading pt-3">AI models</h3>
          {AI_MODELS.map((model) => <label key={model}><span className="capitalize">{model} model</span><span className="justify-self-end"><Switch checked={p.allowed_models.includes(model)} onCheckedChange={(on) => setP({ ...p, allowed_models: AI_MODELS.filter((m) => (m === model ? on : p.allowed_models.includes(m))) })} aria-label={`${model} model`} /></span></label>)}
        </div>
        <h3 className="adm-heading pt-2">Features shown to artists</h3>
        <ul className="grid gap-1.5">{p.features.map((text, i) => <li key={i} className="flex items-center gap-1.5"><Input className="h-8" aria-label={`Feature ${i + 1}`} value={text} onChange={(e) => setP({ ...p, features: p.features.map((x, j) => (j === i ? e.target.value : x)) })} /><Button size="icon" variant="ghost" aria-label={`Remove feature ${i + 1}`} onClick={() => setP({ ...p, features: p.features.filter((_, j) => j !== i) })}><X className="size-4" /></Button></li>)}</ul>
        <div className="flex gap-2"><Input className="h-8" aria-label="New feature" placeholder="Add feature…" value={feature} onChange={(e) => setFeature(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addFeature(); }} /><Button size="sm" variant="outline" onClick={addFeature}>Add</Button></div>
        <div className="adm-foot">
          <span className="adm-meta" aria-live="polite">{dirty ? "Unsaved changes" : "Saved"}</span>
          <div className="adm-actions"><Button size="sm" variant="ghost" disabled={!dirty || busy} onClick={() => setP(plan)}>Discard</Button><Button size="sm" disabled={!dirty || busy} onClick={() => void save()}>Save {plan.name}</Button></div>
        </div>
      </div>
    </section>
  );
}
