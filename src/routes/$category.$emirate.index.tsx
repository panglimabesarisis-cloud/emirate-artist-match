import { createFileRoute, notFound } from "@tanstack/react-router";
import { getCatalog, searchArtists } from "@/lib/public.functions";
import { SearchPage, validateFilters } from "@/components/site/SearchPage";

export const Route = createFileRoute("/$category/$emirate/")({
  validateSearch: validateFilters,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const catalog = await getCatalog();
    const cat = catalog.categories.find((c) => c.slug === params.category);
    const em = catalog.emirates.find((e) => e.slug === params.emirate);
    if (!cat || !em) throw notFound();
    const results = await searchArtists({ data: { ...deps, category: cat.slug, emirate: em.slug } });
    return { catalog, results, cat, em };
  },
  head: ({ loaderData }) => {
    const t = loaderData ? `${loaderData.cat.name} in ${loaderData.em.name}` : "Talent";
    return {
      meta: [
        { title: `${t} | Sahra` },
        { name: "description", content: `Book ${t.toLowerCase()}: verified profiles, AED pricing and instant quotes.` },
        { property: "og:title", content: t },
        { property: "og:description", content: `Verified ${t.toLowerCase()} with real reviews.` },
      ],
    };
  },
  component: Page,
});

function Page() {
  const { catalog, results, cat, em } = Route.useLoaderData();
  const filters = Route.useSearch();
  return (
    <SearchPage title={`${cat.name} in ${em.name}`} categorySlug={cat.slug} emirateSlug={em.slug} catalog={catalog}
      results={results} filters={filters}
      breadcrumbs={[{ label: cat.name, to: { category: cat.slug } }, { label: em.name }]} />
  );
}
