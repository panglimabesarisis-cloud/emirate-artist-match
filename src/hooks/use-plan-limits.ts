import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** The paid plan's limits as set in Admin → Artist packages. The database enforces the same numbers. */
export function usePlanLimits(artistId: string | null | undefined) {
  return useQuery({
    queryKey: ["plan-limits", artistId],
    enabled: !!artistId,
    queryFn: async () => {
      const plan = await supabase.rpc("effective_artist_plan", { _artist: artistId! });
      if (plan.error) throw plan.error;
      const { data, error } = await supabase.from("plan_tiers").select("code,name,max_categories,max_specialties,max_portfolio,max_clients").eq("code", plan.data ?? "free").single();
      if (error) throw error;
      return data;
    },
  });
}
