import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Plan = { code: string; name: string; price_monthly: number; price_yearly: number; ai_credits: number; max_photos: number; max_videos: number; commission_pct: number; features: string[] };

export function AdminPlans() {
  const { data } = useQuery({ queryKey: ["admin-plans"], queryFn: async () => (await supabase.from("plan_tiers").select("*").order("sort")).data ?? [] });
  const counts = useQuery({ queryKey: ["admin-plan-counts"], queryFn: async () => (await supabase.from("artists").select("plan")).data ?? [] }).data ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {data?.map((p) => <PlanCard key={p.code} plan={{ ...p, features: Array.isArray(p.features) ? (p.features as string[]) : [] }} count={counts.filter((c) => c.plan === p.code).length} />)}
    </div>
  );
}

function PlanCard({ plan, count }: { plan: Plan; count: number }) {
  const qc = useQueryClient();
  const [p, setP] = useState(plan);
  const [feat, setFeat] = useState("");
  useEffect(() => setP(plan), [plan]);
  const num = (k: keyof Plan) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: Number(e.target.value) });
  const save = async () => {
    const { code, ...rest } = p;
    const { error } = await supabase.from("plan_tiers").update({ ...rest, updated_at: new Date().toISOString() }).eq("code", code);
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
