import { parseSiteSettings } from "./site-settings";
import { createServerFn } from "@tanstack/react-start";
import { conciergeInput } from "./concierge-rules";
import { artistOwnedMediaPath, publicPhysicalDetails } from "./public-profile";
import { ALL, matchesSearch } from "./artist-search";

export const askPublicConcierge = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => conciergeInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const { answerPublicConcierge } = await import("./public-concierge.server");
      return { ok: true as const, reply: await answerPublicConcierge(data) };
    } catch (error) {
      const { GatewayError } = await import("@lovable.dev/ai-gateway");
      const creditIssue = error instanceof GatewayError && error.code === "payment_required";
      return { ok: false as const, error: creditIssue
        ? "The AI agent is temporarily paused. Please use the artist profiles or contact support."
        : "The AI agent is unavailable right now. Please try again later." };
    }
  });

export type ArtistCard = {
  id: string;
  slug: string;
  stage_name: string;
  tagline: string | null;
  languages: string[];
  event_type_slugs: string[];
  featured: boolean;
  plan: string;
  hue: number;
  profilePhotoUrl?: string | null;
  category: { slug: string; name: string; name_ar?: string | null } | null;
  subcategory: { slug: string; name: string } | null;
  specialty_slugs?:string[];
  category_slugs?: string[];
  specialty_names?: string[];
  emirate: { slug: string; name: string; name_ar?: string | null } | null;
  area: { slug: string; name: string } | null;
  badges: string[];
  /** Holds a paid subscription today. */
  subscribed?: boolean;
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

/** Artists whose subscription is paid today (the rule of effective_artist_plan). Only the ids leave the server.
 *  A failed read hides the badge rather than the artists. */
async function paidSubscriberIds(admin: typeof import("@/integrations/supabase/client.server").supabaseAdmin, ids: string[]) {
  if (!ids.length) return new Set<string>();
  try {
    const { data } = await admin.from("artist_subscriptions").select("artist_id").eq("environment", "sandbox")
      .in("status", ["active", "trialing", "past_due", "canceled", "unpaid"]).gt("paid_until", new Date().toISOString()).in("artist_id", ids);
    return new Set((data ?? []).map((row) => row.artist_id));
  } catch {
    return new Set<string>();
  }
}

async function loadCards(filter?: { artistSlug?: string }) {
  const { publicClient } = await import("./public-client.server");
  const sb = publicClient();
  let q = sb
    .from("artists")
    .select(
      "id, slug, stage_name, tagline, languages, event_type_slugs, featured, plan, hue, photo_path, specialty_ids, category_ids, category:categories(id,slug,name,name_ar), subcategory:subcategories(id,slug,name), emirate:emirates(slug,name,name_ar), area:areas(slug,name), artist_badges(badge)",
    )
    .eq("status", "approved");
  if (filter?.artistSlug) q = q.eq("slug", filter.artistSlug);
  const [{ data: artists, error }, { data: stats }] = await Promise.all([q, sb.rpc("artist_public_stats")]);
  if (error) throw new Error(error.message);
  const photoPaths = (artists ?? []).flatMap(artist => {
    const path = artistOwnedMediaPath(artist.id, artist.photo_path);
    return path ? [path] : [];
  });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const signedPhotos = photoPaths.length ? (await supabaseAdmin.storage.from("artist-media").createSignedUrls(photoPaths, 6 * 3600)).data ?? [] : [];
  const statMap = new Map((stats ?? []).map((s) => [s.artist_id, s]));
  const subscribers = await paidSubscriberIds(supabaseAdmin, (artists ?? []).map((a) => a.id));
  const {data:specialties}=await sb.from('subcategories').select('id,slug,name');
  const {data:categoryRows}=await sb.from('categories').select('id,slug');
  const categorySlugs=new Map((categoryRows??[]).map(c=>[c.id,c.slug]));
  const slugMap=new Map((specialties??[]).map(s=>[s.id,s.slug]));
  const nameMap=new Map((specialties??[]).map(s=>[s.id,s.name]));
  return (artists ?? []).map((a): ArtistCard => {
    const s = statMap.get(a.id);
    return {
      id: a.id,
      slug: a.slug,
      stage_name: a.stage_name,
      tagline: a.tagline,
      languages: a.languages ?? [],
      event_type_slugs: a.event_type_slugs ?? [],
      featured: a.featured,
      plan: a.plan,
      hue: a.hue ?? 30,
      profilePhotoUrl: signedPhotos.find(photo => photo.path === artistOwnedMediaPath(a.id, a.photo_path))?.signedUrl ?? null,
      category: a.category,
      subcategory: a.subcategory,
      specialty_slugs:(a.specialty_ids??[]).flatMap(id=>{const slug=slugMap.get(id);return slug?[slug]:[];}),
      specialty_names: (a.specialty_ids ?? []).flatMap(id => { const name = nameMap.get(id); return name ? [name] : []; }),
      category_slugs: (a.category_ids ?? []).flatMap(id => { const slug = categorySlugs.get(id); return slug ? [slug] : []; }),
      emirate: a.emirate,
      area: a.area,
      badges: (a.artist_badges ?? []).map((b) => b.badge),
      subscribed: subscribers.has(a.id),
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
    .slice(0, 12);
});

export type SearchInput = {
  /** Free text matched against artist name, talent and city. */
  q?: string | undefined;
  category?: string | undefined;
  sub?: string | undefined;
  emirate?: string | undefined;
  area?: string | undefined;
  event?: string | undefined;
  lang?: string | undefined;
  minRating?: number | undefined;
  verified?: boolean | undefined;
  top?: boolean | undefined;
  sort?: "recommended" | "rating" | "bookings" | undefined;
};

export const searchArtists = createServerFn({ method: "GET" })
  .inputValidator((i: SearchInput) => i)
  .handler(async ({ data }) => {
    let cards = await loadCards();
    if (data.q) cards = cards.filter((c) => matchesSearch(c, data.q));
    if (data.category && data.category !== ALL) cards = cards.filter((c) => c.category?.slug === data.category || c.category_slugs?.includes(data.category!));
    if (data.sub) cards = cards.filter((c) => c.subcategory?.slug === data.sub||c.specialty_slugs?.includes(data.sub??''));
    if (data.emirate) cards = cards.filter((c) => c.emirate?.slug === data.emirate);
    if (data.area) cards = cards.filter((c) => c.area?.slug === data.area);
    if (data.event) cards = cards.filter((c) => c.event_type_slugs.includes(data.event!));
    if (data.lang) cards = cards.filter((c) => c.languages.includes(data.lang!));
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
      .map((c) => ({ id: c.id, slug: c.slug, stage_name: c.stage_name, rating: c.stats.rating }));
    const { publicClient } = await import("./public-client.server");
    const sb = publicClient();
    const [{ data: full }, { data: rates }, { data: reviews }, { data: blocked }, { data: mediaRows }, { data: portfolioRows }, { data: clientRows }] = await Promise.all([
      sb.from("artists").select("bio, travel_radius_km, photo_path, skills, body, category_ids, specialty_ids").eq("id", card.id).single(),
      // Rates are private to the chat and the invoice: only what the booking form needs leaves the server, never a price.
      import("@/integrations/supabase/client.server").then(({ supabaseAdmin: admin }) => admin.from("rate_cards").select("id, title, job_kind").eq("artist_id", card.id).order("sort")),
      sb
        .from("reviews")
        .select("id, client_name, event_label, rating, rating_performance, rating_punctuality, rating_communication, body, reply, created_at")
        .eq("artist_id", card.id)
        .order("created_at", { ascending: false })
        .limit(20),
      sb.from("availability").select("date").eq("artist_id", card.id).gte("date", new Date().toISOString().slice(0, 10)),
      sb.from("artist_media").select("id, kind, url, storage_path, caption, is_cover").eq("artist_id", card.id).order("sort").order("created_at"),
      sb.from("artist_portfolio").select("id,title,year,kind,link,description,image_path").eq("artist_id", card.id).order("sort").order("created_at"),
      sb.from("artist_clients").select("id,name,year").eq("artist_id", card.id).eq("is_public", true).order("year", { ascending: false }),
    ]);
    const photoPath = artistOwnedMediaPath(card.id, full?.photo_path);
    const paths = [...new Set([
      photoPath,
      ...(mediaRows ?? []).map(m => artistOwnedMediaPath(card.id, m.storage_path)),
      ...(portfolioRows ?? []).map(m => artistOwnedMediaPath(card.id, m.image_path)),
    ].filter((path): path is string => !!path))];
    // Bucket is private with no public read; sign server-side only for this approved artist's listed files.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const signed = paths.length ? (await supabaseAdmin.storage.from("artist-media").createSignedUrls(paths, 60 * 60 * 6)).data ?? [] : [];
    const imageUrl = (path: string | null | undefined) => {
      const owned = artistOwnedMediaPath(card.id, path);
      return owned ? signed.find(image => image.path === owned)?.signedUrl ?? null : null;
    };
    const [{ data: categories }, { data: specialties }] = await Promise.all([
      full?.category_ids?.length ? sb.from("categories").select("id,name,slug").in("id", full.category_ids) : Promise.resolve({ data: [] }),
      full?.specialty_ids?.length ? sb.from("subcategories").select("id,name,slug").in("id", full.specialty_ids) : Promise.resolve({ data: [] }),
    ]);
    // The cover photo goes first; everything else keeps the order the artist chose.
    // Anonymous busy slots for the public schedule: only dates and times, never client or event details.
    const { data: busyRows } = await supabaseAdmin.from("bookings").select("event_date, start_time, end_time").eq("artist_id", card.id).is("deleted_at", null).neq("status", "cancelled").gte("event_date", new Date().toISOString().slice(0, 10)).limit(1000);
    const busy = (busyRows ?? []).map((b) => ({ date: b.event_date as string, start: (b.start_time as string | null)?.slice(0, 5) ?? null, end: (b.end_time as string | null)?.slice(0, 5) ?? null }));
    const media = [...(mediaRows ?? [])].sort((a, b) => Number(b.is_cover) - Number(a.is_cover)).map((m) => ({
      id: m.id, kind: m.kind as "photo" | "video" | "youtube", caption: m.caption,
      src: m.storage_path ? imageUrl(m.storage_path) ?? "" : m.url,
    })).filter((m) => m.src);
    return {
      ...card,
      bio: full?.bio ?? null,
      travel_radius_km: full?.travel_radius_km ?? null,
      profilePhotoUrl: imageUrl(photoPath),
      skills: full?.skills ?? [],
      physicalDetails: publicPhysicalDetails(full?.body),
      categories: [...(card.category ? [card.category] : []), ...(categories ?? []).filter(category => category.slug !== card.category?.slug)],
      specialties: [...(card.subcategory ? [card.subcategory] : []), ...(specialties ?? []).filter(specialty => specialty.slug !== card.subcategory?.slug)],
      portfolio: (portfolioRows ?? []).map(work => ({ id: work.id, title: work.title, year: work.year, kind: work.kind, description: work.description, link: work.link?.startsWith("https://") ? work.link : null, imageUrl: imageUrl(work.image_path) })),
      clients: clientRows ?? [],
      rateCards: rates ?? [],
      reviews: reviews ?? [],
      blockedDates: (blocked ?? []).map((b) => b.date),
      busy,
      similar,
      media,
    };
  });

/** Saved website settings, for page titles rendered on the server. */
export const getSiteSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { publicClient } = await import("./public-client.server");
  const { data } = await publicClient().from("site_settings").select("key, value").in("key", ["general", "menu", "invoice"]);
  return parseSiteSettings(data ?? []);
});

export const getSitePage = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    const { publicClient } = await import("./public-client.server");
    const { data: page } = await publicClient().from("site_pages").select("title, body, updated_at").eq("slug", data.slug).eq("published", true).maybeSingle();
    return page;
  });
