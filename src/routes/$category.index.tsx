import { createFileRoute, notFound } from "@tanstack/react-router";
import { getCatalog, searchArtists } from "@/lib/public.functions";
import { SearchPage, validateFilters } from "@/components/site/SearchPage";

export const Route = createFileRoute("/$category/")({
  validateSearch: validateFilters,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const catalog = await getCatalog();
    const cat = catalog.categories.find((c) => c.slug === params.category);
    if (!cat) throw notFound();
    const results = await searchArtists({ data: { ...deps, category: params.category } });
    return { catalog, results, cat };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.cat.name ?? "Talent";
    return {
      meta: [
        { title: `${name} for hire in the UAE | Dealmaker` },
        { name: "description", content: `Compare verified ${name.toLowerCase()} across Dubai and the UAE. Prices in AED, real reviews, instant AI quotes.` },
        { property: "og:title", content: `${name} for hire in the UAE` },
        { property: "og:description", content: `Verified ${name.toLowerCase()} with real reviews and instant AI quotes.` },
      ],
    };
  },
  component: Page,
});

function Page() {
  const { catalog, results, cat } = Route.useLoaderData();
  const filters = Route.useSearch();
  return (
    <SearchPage title={`${cat.name} in the UAE`} categorySlug={cat.slug} catalog={catalog} results={results}
      filters={filters} breadcrumbs={[{ label: cat.name }]} />
  );
}
