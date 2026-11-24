import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Both owner previews use the same expiring private-storage URL. */
export function useProfilePhoto(artistId: string, photoPath: string | null) {
  return useQuery({
    queryKey: ["profile-photo", artistId, photoPath],
    enabled: !!photoPath,
    staleTime: 45 * 60_000,
    queryFn: async () => {
      if (!photoPath) return null;
      const { data, error } = await supabase.storage.from("artist-media").createSignedUrl(photoPath, 3600);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}