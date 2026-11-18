import { createFileRoute, notFound } from "@tanstack/react-router";
import { getCatalog, searchArtists } from "@/lib/public.functions";
import { SearchPage, validateFilters } from "@/components/site/SearchPage";

export const Route = createFileRoute("/$category/$emirate/$area")({
  validateSearch: validateFilters,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const catalog = await getCatalog();
    const cat = catalog.categories.find((c) => c.slug === params.category);
    const em = catalog.emirates.find((e) => e.slug === params.emirate);
    const area = em && catalog.areas.find((a) => a.slug === params.area && a.emirate_id === em.id);
    if (!cat || !em || !area) throw notFound();
    // Show artists in the emirate; area matches first (nearby fallback).
    const all = await searchArtists({ data: { ...deps, category: cat.slug, emirate: em.slug } });
    const results = [...all.filter((a) => a.area?.slug === area.slug), ...all.filter((a) => a.area?.slug !== area.slug)];
    return { catalog, results, cat, em, area };
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.cat.name} in ${loaderData.area.name}, ${loaderData.em.name}` : "Talent";
    return {
      meta: [
        { title: `${t} | Sahra` },
        { name: "description", content: `Hire ${t.toLowerCase()} and nearby areas. Verified talent with AED pricing.` },
        { property: "og:title", content: t },
        { property: "og:description", content: `Verified ${t.toLowerCase()} and nearby.` },
      ],
    };
  },
  component: Page,
});

function Page() {
  const { catalog, results, cat, em, area } = Route.useLoaderData();
  const filters = Route.useSearch();
  return (
    <SearchPage title={`${cat.name} in ${area.name}`} categorySlug={cat.slug} emirateSlug={em.slug} catalog={catalog}
      results={results} filters={filters}
      breadcrumbs={[{ label: cat.name, to: { category: cat.slug } }, { label: em.name, to: { category: cat.slug, emirate: em.slug } }, { label: area.name }]} />
  );
}
