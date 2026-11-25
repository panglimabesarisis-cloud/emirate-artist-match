import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { applyPending, readPending } from "@/lib/signup-specialties";
import { useI18n } from "@/lib/i18n";

type Artist = { id: string; category_id: string | null; specialty_ids?: string[] | null };

/** Adds the specialties chosen at registration once the paid plan allows them. */
export function usePendingSpecialties(artist: Artist | null | undefined, onSaved: () => void) {
  const { t } = useI18n();
  const id = artist?.id;
  useEffect(() => {
    if (!artist || !id) return;
    let active = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const pending = readPending(auth.user?.user_metadata?.["pending_specialties"]);
      if (!pending || !active) return;
      const plan = await supabase.rpc("effective_artist_plan", { _artist: id });
      if (plan.error || !plan.data) return;
      const tier = await supabase.from("plan_tiers").select("max_specialties").eq("code", plan.data).single();
      if (tier.error || !active) return;
      const next = applyPending({ category_id: artist.category_id, ids: artist.specialty_ids ?? [] }, pending, tier.data.max_specialties);
      if (next.save) {
        // The database trigger still checks the category and the paid limit.
        const saved = await supabase.from("artists").update({ specialty_ids: next.save }).eq("id", id);
        if (saved.error) return;
      }
      if (next.save || !next.pending) await supabase.auth.updateUser({ data: { pending_specialties: next.pending } });
      if (next.save && active) { toast.success(t("Your plan specialties have been added to your profile")); onSaved(); }
    })();
    return () => { active = false; };
    // Re-run only when the profile or its saved specialties change.
  }, [id, artist?.category_id, artist?.specialty_ids?.length]);
}
