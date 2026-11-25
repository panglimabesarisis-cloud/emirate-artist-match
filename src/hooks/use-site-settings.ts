import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseSiteSettings } from "@/lib/site-settings";

const DEFAULTS = parseSiteSettings();

/** The saved settings; the built-in values show until they arrive or if they cannot be read. */
export function useSiteSettings() {
  return useQuery({
    queryKey: ["site-settings"], staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("site_settings").select("key, value").in("key", ["general", "menu", "invoice"]);
      if (error) throw error;
      return parseSiteSettings(data ?? []);
    },
  }).data ?? DEFAULTS;
}
