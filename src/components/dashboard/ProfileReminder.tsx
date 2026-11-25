import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

/** The master admin's reminder to finish the profile, until the artist marks it done. */
export function ProfileReminder({ artistId, onOpenProfile }: { artistId: string; onOpenProfile: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["profile-reminder", artistId];
  const reminder = useQuery({
    queryKey: key, refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("artist_profile_reminders").select("id,message,missing,created_at").eq("artist_id", artistId).is("resolved_at", null).order("created_at", { ascending: false }).limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  }).data;
  if (!reminder) return null;
  const done = async () => {
    const { data, error } = await supabase.rpc("resolve_profile_reminder", { _id: reminder.id });
    if (error || !data) { toast.error(t("Could not close the reminder.")); return; }
    await qc.invalidateQueries({ queryKey: key });
  };
  return (
    <div role="alert" className="mb-5 flex flex-wrap items-start gap-3 rounded-lg border border-gold/50 bg-gold/10 p-4">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-gold" />
      <div className="min-w-[220px] flex-1">
        <b className="block">{t("Please complete your profile")}</b>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{reminder.message}</p>
        {reminder.missing.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{reminder.missing.map((item) => <li key={item} className="rounded-full border border-gold/40 px-2.5 py-0.5 text-xs">{t(item)}</li>)}</ul>}
        <p className="mt-2 text-xs text-muted-foreground">{t("From the Dealmaker admin")} · {new Date(reminder.created_at).toLocaleDateString("en-GB")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="bg-gradient-gold text-gold-foreground" onClick={onOpenProfile}>{t("Complete profile")}</Button>
        <Button size="sm" variant="outline" onClick={() => void done()}>{t("Mark as done")}</Button>
      </div>
    </div>
  );
}
