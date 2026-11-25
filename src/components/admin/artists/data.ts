import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { artistOwnedMediaPath } from "@/lib/public-profile";

const ARTIST_COLUMNS = "id, user_id, slug, stage_name, status, plan, intended_plan, featured, created_at, base_price, category_id, category_ids, subcategory_id, specialty_ids, emirate_id, area_id, tagline, bio, languages, skills, body, event_type_slugs, photo_path, trn, notify_phone, manager_phone, travel_radius_km, travel_surcharge_enabled, travel_step_km, travel_fee_per_step, onboarding_complete, registration_paid_at, contract_accepted_at, is_seed, categories!artists_category_id_fkey(name), emirates(name), areas(name)";

/** Throws on a refused or failed read, so a page never shows "nothing" when it could not look. */
async function rows<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function useArtists() {
  return useQuery({ queryKey: ["admin-artists"], queryFn: () => rows(supabase.from("artists").select(ARTIST_COLUMNS).order("created_at", { ascending: false })) });
}
export type AdminArtist = NonNullable<ReturnType<typeof useArtists>["data"]>[number];

export function useUpdateArtist() {
  const qc = useQueryClient();
  return async (id: string, patch: { status?: string; featured?: boolean; plan?: string; category_id?: string }, message = "Saved") => {
    const { error } = await supabase.from("artists").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return false; }
    toast.success(message);
    await Promise.all(["admin-artists", "admin-overview", "admin-pending-count", "admin-artist-stats"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
    return true;
  };
}

export function useCategories() {
  return useQuery({ queryKey: ["admin-categories"], queryFn: () => rows(supabase.from("categories").select("*").order("sort").order("name")) });
}
export function useSpecialities() {
  return useQuery({ queryKey: ["admin-specialities"], queryFn: () => rows(supabase.from("subcategories").select("id,category_id,name,slug").order("name")) });
}
export function useBadges() {
  return useQuery({ queryKey: ["admin-badges"], queryFn: () => rows(supabase.from("artist_badges").select("artist_id,badge")) });
}
export function usePlans() {
  return useQuery({ queryKey: ["admin-plans"], queryFn: () => rows(supabase.from("plan_tiers").select("*").order("sort")) });
}
export function useArtistStats() {
  return useQuery({ queryKey: ["admin-artist-stats"], queryFn: async () => new Map((await rows(supabase.rpc("admin_artist_stats"))).map((row) => [row.artist_id, row])) });
}

/** A signed link for each of one artist's stored files; paths outside their folder are never signed. */
export async function signMedia(entries: { artistId: string; path: string | null | undefined }[]) {
  const paths = entries.flatMap((e) => artistOwnedMediaPath(e.artistId, e.path) ?? []);
  const links = new Map<string, string>();
  for (let at = 0; at < paths.length; at += 100) {
    const { data, error } = await supabase.storage.from("artist-media").createSignedUrls(paths.slice(at, at + 100), 3600);
    if (error) throw new Error(error.message);
    for (const item of data ?? []) if (item.path && item.signedUrl) links.set(item.path, item.signedUrl);
  }
  return links;
}

/** One picture per artist: the profile photo, else the cover or first photo of their media. */
export function useArtistPhotos(artists: AdminArtist[]) {
  const ids = artists.map((a) => a.id);
  return useQuery({
    queryKey: ["admin-artist-photos", ids, artists.map((a) => a.photo_path)],
    enabled: ids.length > 0,
    staleTime: 45 * 60_000,
    queryFn: async () => {
      const media = await rows(supabase.from("artist_media").select("artist_id,url,storage_path,is_cover,sort").eq("kind", "photo").in("artist_id", ids).order("is_cover", { ascending: false }).order("sort"));
      const chosen = artists.map((a) => {
        const cover = media.find((m) => m.artist_id === a.id);
        return { artistId: a.id, path: a.photo_path ?? cover?.storage_path, external: !a.photo_path && /^https:\/\//.test(cover?.url ?? "") ? cover!.url : null };
      });
      const links = await signMedia(chosen);
      return new Map(chosen.flatMap((c) => { const url = (c.path ? links.get(c.path) : null) ?? c.external; return url ? [[c.artistId, url] as const] : []; }));
    },
  }).data ?? new Map<string, string>();
}

export const dateLabel = (value: string | null | undefined) => (value ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const BADGE_NAMES: Record<string, string> = { verified_identity: "ID Verified", verified_business: "Business Verified", verified_performer: "Verified Performer", top_performer: "Top Performer", top: "Top 10%" };
