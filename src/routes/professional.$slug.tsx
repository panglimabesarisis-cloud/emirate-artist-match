import { createFileRoute, notFound } from "@tanstack/react-router";
import { getArtist, getCatalog } from "@/lib/public.functions";
import { recoverPublicRead } from "@/lib/public-read-recovery";
import { ArtistPage } from "./artist.$slug";

/**
 * The same profile under a name that fits designers, interior and other
 * non-stage work. One row served at two paths, so the canonical link keeps
 * search engines on a single address.
 */
export const Route = createFileRoute("/professional/$slug")({
  loader: async ({ params }) => {
    const [artist, catalog] = await Promise.all([
      recoverPublicRead(() => getArtist({ data: { slug: params.slug } })),
      recoverPublicRead(() => getCatalog()),
    ]);
    if (!artist) throw notFound();
    return { artist, catalog };
  },
  head: ({ loaderData, params }) => {
    const a = loaderData?.artist;
    const canonical = { rel: "canonical", href: `https://dealmakertalent.com/artist/${params.slug}` };
    if (!a) return { meta: [{ title: "Profile unavailable | Dealmaker" }, { name: "robots", content: "noindex" }], links: [canonical] };
    const title = `${a.stage_name} — ${a.subcategory?.name ?? "Professional"} in ${a.area?.name ?? "Dubai"}`;
    return {
      meta: [
        { title: `${title} | Dealmaker` },
        { name: "description", content: a.tagline ?? title },
        { property: "og:title", content: title },
        { property: "og:description", content: a.tagline ?? title },
        { property: "og:type", content: "profile" },
      ],
      links: [canonical],
    };
  },
  component: ArtistPage,
});
