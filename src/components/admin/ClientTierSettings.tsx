import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StudioSection } from "@/components/dashboard/StudioPage";
import { TierBadge } from "@/components/shared/TierBadge";

type Row = { tier: number; pct: string; target: string; min: string };
const within = (value: string, low: number, high: number) => value.trim() !== "" && Number(value) >= low && Number(value) <= high;
const rowValid = (r: Row) => within(r.pct, 0, 20) && within(r.target, 0.01, 1_000_000) && within(r.min, 0, 100_000);
const round = (value: string) => Math.round(Number(value) * 100) / 100;

/** Master admin: rate, tier-up target and minimum withdrawal of each client commission tier. */
export function ClientTierSettings() {
  const qc = useQueryClient();
  const saved = useQuery({
    queryKey: ["admin-client-tiers"],
    queryFn: async () => {
      const [tiers, program] = await Promise.all([
        supabase.from("client_commission_tiers").select("tier,commission_pct,target_amount,min_withdrawal,updated_at").order("tier"),
        supabase.from("client_program_settings").select("commission_pct,min_withdrawal,enabled").maybeSingle(),
      ]);
      if (tiers.error || program.error) throw new Error("Unable to load programme settings");
      return { tiers: tiers.data ?? [], program: program.data ?? { commission_pct: 2, min_withdrawal: 500, enabled: true } };
    },
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!saved.data) return;
    setRows(saved.data.tiers.map((t) => ({ tier: t.tier, pct: String(Number(t.commission_pct)), target: String(Number(t.target_amount)), min: String(Number(t.min_withdrawal)) })));
    setEnabled(saved.data.program.enabled);
  }, [saved.data]);
  const invalid = rows.length === 0 || !rows.every(rowValid);
  const change = (tier: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.tier === tier ? { ...r, ...patch } : r)));
  const save = async () => {
    if (invalid || !saved.data) return;
    setBusy(true);
    try {
      const program = await supabase.from("client_program_settings").upsert({ id: true, commission_pct: Number(saved.data.program.commission_pct), min_withdrawal: Number(saved.data.program.min_withdrawal), enabled });
      if (program.error) throw new Error(program.error.message);
      for (const r of rows) {
        const result = await supabase.from("client_commission_tiers").update({ commission_pct: round(r.pct), target_amount: round(r.target), min_withdrawal: round(r.min) }).eq("tier", r.tier).select("tier");
        if (result.error) throw new Error(result.error.message);
        if (!result.data?.length) throw new Error(`Tier ${r.tier} was not saved. Sign in as the master admin.`);
      }
      toast.success("Client commission saved. New rates apply from each booking's first payment.");
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); await qc.invalidateQueries({ queryKey: ["admin-client-tiers"] }); }
  };
  return (
    <StudioSection title="Client commission" accent="tiers" subtitle="Clients start at tier 1 and move up one tier each time their paid invoices (before VAT) reach that tier's target. A booking keeps the rate it had at its first payment.">
      {saved.error ? <p role="alert" className="p-4 text-sm text-destructive">Unable to load programme settings.</p> : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b text-start text-xs uppercase tracking-wider text-muted-foreground"><th className="p-3 text-start">Tier</th><th className="p-3 text-start">Commission (%)</th><th className="p-3 text-start">Target to move up (AED)</th><th className="p-3 text-start">Minimum withdrawal (AED)</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tier} className="border-b last:border-0">
                    <td className="p-3"><span className="inline-flex items-center gap-2 font-semibold"><TierBadge tier={r.tier} />{r.tier}</span></td>
                    <td className="p-3"><Input aria-label={`Tier ${r.tier} commission`} type="number" min={0} max={20} step="0.01" value={r.pct} onChange={(e) => change(r.tier, { pct: e.target.value })} /></td>
                    <td className="p-3"><Input aria-label={`Tier ${r.tier} target`} type="number" min={0.01} max={1000000} step="0.01" value={r.target} onChange={(e) => change(r.tier, { target: e.target.value })} /></td>
                    <td className="p-3"><Input aria-label={`Tier ${r.tier} minimum withdrawal`} type="number" min={0} max={100000} step="0.01" value={r.min} onChange={(e) => change(r.tier, { min: e.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-3"><Switch id="tiers-on" checked={enabled} onCheckedChange={setEnabled} /><Label htmlFor="tiers-on">{enabled ? "Programme active" : "Paused for new bookings"}</Label></span>
            <Button type="submit" disabled={invalid || busy}>{busy ? "Saving…" : "Save commission tiers"}</Button>
          </div>
        </form>
      )}
    </StudioSection>
  );
}
