import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import type { TravelSettings as Settings } from "@/lib/travel-rules";

export function TravelSettings({ value, onChange }: { value: Settings; onChange: (v: Partial<Settings>) => void }) {
  const { t } = useI18n();
  const enabled = value.travel_surcharge_enabled ?? false;
  return <div className="col-span-full space-y-4 border-t border-border pt-4">
    <div className="flex items-center justify-between gap-4"><Label htmlFor="travel-enabled">{t("Add cost per distance")}</Label><Switch id="travel-enabled" checked={enabled} onCheckedChange={travel_surcharge_enabled => onChange({ travel_surcharge_enabled })} /></div>
    {enabled && <div className="grid gap-4 sm:grid-cols-2">
      <div className="dmr-qe-f"><Label htmlFor="travel-step">{t("Distance interval")}</Label><Select value={String(value.travel_step_km ?? 10)} onValueChange={v => onChange({ travel_step_km: Number(v) })}><SelectTrigger id="travel-step"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="5">{t("Per 5 km")}</SelectItem><SelectItem value="10">{t("Per 10 km")}</SelectItem></SelectContent></Select></div>
      <div className="dmr-qe-f"><Label htmlFor="travel-fee">{t("Additional cost (AED)")}</Label><Input id="travel-fee" type="number" min="0.01" step="0.01" value={value.travel_fee_per_step ?? 0} onChange={e => onChange({ travel_fee_per_step: Number(e.target.value) })} /></div>
    </div>}
  </div>;
}