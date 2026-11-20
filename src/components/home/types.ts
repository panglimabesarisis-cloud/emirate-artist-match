import type { getCatalog, ArtistCard } from "@/lib/public.functions";

export type HomeCatalog = Awaited<ReturnType<typeof getCatalog>>;
export type HomeData = { catalog: HomeCatalog; featured: ArtistCard[] };