import { createFileRoute, notFound } from "@tanstack/react-router";
import { getSitePage } from "@/lib/public.functions";
import { PublicLayout } from "@/components/site/PublicLayout";

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    const page = await getSitePage({ data: { slug: params.slug } });
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.title} | Dealmaker` : "Page | Dealmaker";
    const desc = loaderData?.body.slice(0, 150) ?? "Dealmaker — UAE talent marketplace";
    return { meta: [{ title }, { name: "description", content: desc }, { property: "og:title", content: title }, { property: "og:description", content: desc }, { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" }] };
  },
  notFoundComponent: () => <PublicLayout><div className="p-16 text-center">Page not found.</div></PublicLayout>,
  component: SitePage,
});

function SitePage() {
  // Typed here: inference through the route tree is circular and falls back to any.
  const page: { title: string; body: string } = Route.useLoaderData();
  return (
    <PublicLayout>
      <article className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-semibold">{page.title}</h1>
        <div className="mt-6 space-y-4 leading-relaxed">{page.body.split(/\n\s*\n/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</div>
      </article>
    </PublicLayout>
  );
}
