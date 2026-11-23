import { createServerFn } from "@tanstack/react-start";

export type ArtistCard = {
  id: string;
  slug: string;
  stage_name: string;
  tagline: string | null;
  base_price: number;
  languages: string[];
  event_type_slugs: string[];
  featured: boolean;
  plan: string;
  hue: number;
  category: { slug: string; name: string } | null;
  subcategory: { slug: string; name: string } | null;
  specialty_slugs?:string[];
  emirate: { slug: string; name: string } | null;
  area: { slug: string; name: string } | null;
  badges: string[];
  stats: {
    completed_orders: number | null;
    rating: number | null;
    review_count: number;
    revenue_label: string | null;
    response_rate: number | null;
    repeat_clients: number | null;
    member_since: string | null;
  };
};

async function loadCards(filter?: { artistSlug?: string }) {
  const { publicClient } = await import("./public-client.server");
  const sb = publicClient();
  let q = sb
    .from("artists")
    .select(
      "id, slug, stage_name, tagline, base_price, languages, event_type_slugs, featured, plan, hue, specialty_ids, category:categories(slug,name), subcategory:subcategories(slug,name), emirate:emirates(slug,name), area:areas(slug,name), artist_badges(badge)",
    )
    .eq("status", "approved");
  if (filter?.artistSlug) q = q.eq("slug", filter.artistSlug);
  const [{ data: artists, error }, { data: stats }] = await Promise.all([q, sb.rpc("artist_public_stats")]);
  if (error) throw new Error(error.message);
  const statMap = new Map((stats ?? []).map((s) => [s.artist_id, s]));
  const {data:specialties}=await sb.from('subcategories').select('id,slug');
  const slugMap=new Map((specialties??[]).map(s=>[s.id,s.slug]));
  return (artists ?? []).map((a): ArtistCard => {
    const s = statMap.get(a.id);
    return {
      id: a.id,
      slug: a.slug,
      stage_name: a.stage_name,
      tagline: a.tagline,
      base_price: Number(a.base_price ?? 0),
      languages: a.languages ?? [],
      event_type_slugs: a.event_type_slugs ?? [],
      featured: a.featured,
      plan: a.plan,
      hue: a.hue ?? 30,
      category: a.category,
      subcategory: a.subcategory,
      specialty_slugs:(a.specialty_ids??[]).flatMap(id=>{const slug=slugMap.get(id);return slug?[slug]:[];}),
      emirate: a.emirate,
      area: a.area,
      badges: (a.artist_badges ?? []).map((b) => b.badge),
      stats: {
        completed_orders: s?.completed_orders ?? null,
        rating: s?.rating != null ? Number(s.rating) : null,
        review_count: s?.review_count ?? 0,
        revenue_label: s?.revenue_label ?? null,
        response_rate: s?.response_rate ?? null,
        repeat_clients: s?.repeat_clients ?? null,
        member_since: s?.member_since ?? null,
      },
    };
  });
}

export const getCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { publicClient } = await import("./public-client.server");
  const sb = publicClient();
  const [c, s, e, a, et] = await Promise.all([
    sb.from("categories").select("id, slug, name, name_ar, description, icon, sort").order("sort"),
    sb.from("subcategories").select("id, slug, name, category_id").order("name"),
    sb.from("emirates").select("id, slug, name, name_ar, sort").order("sort"),
    sb.from("areas").select("id, slug, name, emirate_id").order("name"),
    sb.from("event_types").select("id, slug, name, sort").order("sort"),
  ]);
  return {
    categories: c.data ?? [],
    subcategories: s.data ?? [],
    emirates: e.data ?? [],
    areas: a.data ?? [],
    eventTypes: et.data ?? [],
  };
});

export const getFeatured = createServerFn({ method: "GET" }).handler(async () => {
  const cards = await loadCards();
  return cards
    .sort((x, y) => Number(y.featured) - Number(x.featured) || (y.stats.rating ?? 0) - (x.stats.rating ?? 0))
    .slice(0, 11);
});

export type SearchInput = {
  category?: string | undefined;
  sub?: string | undefined;
  emirate?: string | undefined;
  area?: string | undefined;
  event?: string | undefined;
  lang?: string | undefined;
  maxPrice?: number | undefined;
  minRating?: number | undefined;
  verified?: boolean | undefined;
  top?: boolean | undefined;
  sort?: "recommended" | "rating" | "price_asc" | "price_desc" | "bookings" | undefined;
};

export const searchArtists = createServerFn({ method: "GET" })
  .inputValidator((i: SearchInput) => i)
  .handler(async ({ data }) => {
    let cards = await loadCards();
    if (data.category) cards = cards.filter((c) => c.category?.slug === data.category);
    if (data.sub) cards = cards.filter((c) => c.subcategory?.slug === data.sub||c.specialty_slugs?.includes(data.sub??''));
    if (data.emirate) cards = cards.filter((c) => c.emirate?.slug === data.emirate);
    if (data.area) cards = cards.filter((c) => c.area?.slug === data.area);
    if (data.event) cards = cards.filter((c) => c.event_type_slugs.includes(data.event!));
    if (data.lang) cards = cards.filter((c) => c.languages.includes(data.lang!));
    if (data.maxPrice) cards = cards.filter((c) => c.base_price <= data.maxPrice!);
    if (data.minRating) cards = cards.filter((c) => (c.stats.rating ?? 0) >= data.minRating!);
    if (data.verified) cards = cards.filter((c) => c.badges.some((b) => b.startsWith("verified")));
    if (data.top) cards = cards.filter((c) => c.badges.includes("top_performer"));
    const score = (c: ArtistCard) =>
      (c.stats.rating ?? 3.5) * 20 +
      Math.min(c.stats.review_count, 30) +
      (c.stats.response_rate ?? 70) * 0.2 +
      c.badges.length * 5 +
      (c.featured ? 15 : 0);
    const sorters: Record<string, (a: ArtistCard, b: ArtistCard) => number> = {
      recommended: (a, b) => score(b) - score(a),
      rating: (a, b) => (b.stats.rating ?? 0) - (a.stats.rating ?? 0),
      price_asc: (a, b) => a.base_price - b.base_price,
      price_desc: (a, b) => b.base_price - a.base_price,
      bookings: (a, b) => (b.stats.completed_orders ?? 0) - (a.stats.completed_orders ?? 0),
    };
    return cards.sort(sorters[data.sort ?? "recommended"]);
  });

export const getArtist = createServerFn({ method: "GET" })
  .inputValidator((i: { slug: string }) => i)
  .handler(async ({ data }) => {
    const all = await loadCards();
    const card = all.find((c) => c.slug === data.slug);
    if (!card) return null;
    const similar = all
      .filter((c) => c.id !== card.id && c.category?.slug === card.category?.slug)
      .sort((x, y) => Number(x.emirate?.slug !== card.emirate?.slug) - Number(y.emirate?.slug !== card.emirate?.slug) || (y.stats.rating ?? 0) - (x.stats.rating ?? 0))
      .slice(0, 4)
      .map((c) => ({ id: c.id, slug: c.slug, stage_name: c.stage_name, base_price: c.base_price, rating: c.stats.rating }));
    const { publicClient } = await import("./public-client.server");
    const sb = publicClient();
    const [{ data: full }, { data: rates }, { data: reviews }, { data: blocked }, { data: mediaRows }] = await Promise.all([
      sb.from("artists").select("bio, travel_radius_km").eq("id", card.id).single(),
      sb.from("rate_cards").select("id, title, description, price, duration_minutes").eq("artist_id", card.id).order("sort"),
      sb
        .from("reviews")
        .select("id, client_name, event_label, rating, rating_performance, rating_punctuality, rating_communication, body, reply, created_at")
        .eq("artist_id", card.id)
        .order("created_at", { ascending: false })
        .limit(20),
      sb.from("availability").select("date").eq("artist_id", card.id).gte("date", new Date().toISOString().slice(0, 10)),
      sb.from("artist_media").select("id, kind, url, storage_path, caption, is_cover").eq("artist_id", card.id).order("sort").order("created_at"),
    ]);
    const paths = (mediaRows ?? []).filter((m) => m.storage_path).map((m) => m.storage_path!);
    // Bucket is private with no public read; sign server-side only for this approved artist's listed files.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = paths.length ? (await supabaseAdmin.storage.from("artist-media").createSignedUrls(paths, 60 * 60 * 6)).data ?? [] : [];
    // The cover photo goes first; everything else keeps the order the artist chose.
    // Anonymous busy slots for the public schedule: only dates and times, never client or event details.
    const { data: busyRows } = await supabaseAdmin.from("bookings").select("event_date, start_time, end_time").eq("artist_id", card.id).is("deleted_at", null).neq("status", "cancelled").gte("event_date", new Date().toISOString().slice(0, 10)).limit(1000);
    const busy = (busyRows ?? []).map((b) => ({ date: b.event_date as string, start: (b.start_time as string | null)?.slice(0, 5) ?? null, end: (b.end_time as string | null)?.slice(0, 5) ?? null }));
    const media = [...(mediaRows ?? [])].sort((a, b) => Number(b.is_cover) - Number(a.is_cover)).map((m) => ({
      id: m.id, kind: m.kind as "photo" | "video" | "youtube", caption: m.caption,
      src: m.storage_path ? signed.find((x) => x.path === m.storage_path)?.signedUrl ?? "" : m.url,
    })).filter((m) => m.src);
    return {
      ...card,
      bio: full?.bio ?? null,
      travel_radius_km: full?.travel_radius_km ?? null,
      rateCards: rates ?? [],
      reviews: reviews ?? [],
      blockedDates: (blocked ?? []).map((b) => b.date),
      busy,
      similar,
      media,
    };
  });

export const getSitePage = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    const { publicClient } = await import("./public-client.server");
    const { data: page } = await publicClient().from("site_pages").select("title, body, updated_at").eq("slug", data.slug).eq("published", true).maybeSingle();
    return page;
  });
