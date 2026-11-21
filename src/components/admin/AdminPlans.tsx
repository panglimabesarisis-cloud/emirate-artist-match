import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Plan = { code: string; name: string; price_monthly: number; price_yearly: number; ai_credits: number; max_photos: number; max_videos: number; max_specialties:number; max_team_members:number; commission_pct: number; features: string[]; max_categories: number; max_portfolio: number; max_clients: number; max_flow_blocks: number; max_form_questions: number; max_active_prompts: number; max_own_prompts: number; allowed_models: string[] };

export function AdminPlans() {
  const { data } = useQuery({ queryKey: ["admin-plans"], queryFn: async () => (await supabase.from("plan_tiers").select("*").order("sort")).data ?? [] });
  const counts = useQuery({ queryKey: ["admin-plan-counts"], queryFn: async () => (await supabase.from("artists").select("plan")).data ?? [] }).data ?? [];
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {data?.map((p) => <PlanCard key={p.code} plan={{ ...p, features: Array.isArray(p.features) ? (p.features as string[]) : [], allowed_models: Array.isArray(p.allowed_models) ? p.allowed_models : [] }} count={counts.filter((c) => c.plan === p.code).length} />)}
    </div>
  );
}

function PlanCard({ plan, count }: { plan: Plan; count: number }) {
  const qc = useQueryClient();
  const [p, setP] = useState(plan);
  const [feat, setFeat] = useState("");
  const [models, setModels] = useState(plan.allowed_models.join(", "));
  useEffect(() => { setP(plan); setModels(plan.allowed_models.join(", ")); }, [plan]);
  const num = (k: keyof Plan) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: Number(e.target.value) });
  const save = async () => {
    const { code, ...rest } = p;
    const allowed_models = models.split(",").map((m) => m.trim().toLowerCase()).filter(Boolean);
    if (!allowed_models.length) { toast.error("Allow at least one AI model"); return; }
    const { error } = await supabase.from("plan_tiers").update({ ...rest, allowed_models, updated_at: new Date().toISOString() }).eq("code", code);
    if (error) { toast.error(error.message); return; }
    toast.success(`${p.name} saved`); qc.invalidateQueries({ queryKey: ["admin-plans"] });
  };
  return (
    <div className="rounded-xl border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Input className="text-lg font-semibold max-w-[60%]" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        <span className="text-xs text-muted-foreground">{count} artists</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <F label="Monthly (AED)"><Input type="number" value={p.price_monthly} onChange={num("price_monthly")} /></F>
        <F label="Yearly (AED)"><Input type="number" value={p.price_yearly} onChange={num("price_yearly")} /></F>
        <F label="AI credits / month"><Input type="number" value={p.ai_credits} onChange={num("ai_credits")} /></F>
        <F label="Commission %"><Input type="number" value={p.commission_pct} onChange={num("commission_pct")} /></F>
        <F label="Max photos"><Input type="number" value={p.max_photos} onChange={num("max_photos")} /></F>
        <F label="Max videos"><Input type="number" value={p.max_videos} onChange={num("max_videos")} /></F>
        <F label="Max specialties"><Input type="number" min={1} value={p.max_specialties} onChange={num("max_specialties")} /></F>
        <F label="Max team members (-1 unlimited)"><Input type="number" min={-1} value={p.max_team_members} onChange={num("max_team_members")} /></F>
        <F label="Max categories"><Input type="number" min={1} value={p.max_categories} onChange={num("max_categories")} /></F>
        <F label="Max portfolio items"><Input type="number" min={0} value={p.max_portfolio} onChange={num("max_portfolio")} /></F>
        <F label="Max past clients"><Input type="number" min={0} value={p.max_clients} onChange={num("max_clients")} /></F>
        <F label="Max flow blocks"><Input type="number" min={1} value={p.max_flow_blocks} onChange={num("max_flow_blocks")} /></F>
        <F label="Max form questions"><Input type="number" min={1} value={p.max_form_questions} onChange={num("max_form_questions")} /></F>
        <F label="Max active prompts"><Input type="number" min={0} value={p.max_active_prompts} onChange={num("max_active_prompts")} /></F>
        <F label="Max own prompts"><Input type="number" min={0} value={p.max_own_prompts} onChange={num("max_own_prompts")} /></F>
      </div>
      <div>
        <Label className="text-xs" htmlFor={`models-${p.code}`}>Allowed AI models (comma separated)</Label>
        <Input id={`models-${p.code}`} value={models} onChange={(e) => setModels(e.target.value)} placeholder="fast, balanced, advanced" />
      </div>
      <div>
        <Label className="text-xs">Features</Label>
        <ul className="mt-1 space-y-1">
          {p.features.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="text-gold">✓</span>
              <Input className="h-8" value={f} onChange={(e) => setP({ ...p, features: p.features.map((x, j) => (j === i ? e.target.value : x)) })} />
              <Button size="sm" variant="ghost" onClick={() => setP({ ...p, features: p.features.filter((_, j) => j !== i) })}>✕</Button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <Input className="h-8" placeholder="Add feature…" value={feat} onChange={(e) => setFeat(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && feat.trim()) { setP({ ...p, features: [...p.features, feat.trim()] }); setFeat(""); } }} />
          <Button size="sm" variant="outline" onClick={() => { if (feat.trim()) { setP({ ...p, features: [...p.features, feat.trim()] }); setFeat(""); } }}>Add</Button>
        </div>
      </div>
      <Button className="mt-auto" onClick={save}>Save {p.name}</Button>
    </div>
  );
}
const F = ({ label, children }: { label: string; children: React.ReactNode }) => <div><Label className="text-xs">{label}</Label>{children}</div>;
