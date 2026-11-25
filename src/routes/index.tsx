import { createFileRoute } from "@tanstack/react-router";
import { getCatalog, getFeatured, getSiteSettings } from "@/lib/public.functions";
import { DealmakerHome } from "@/components/home/DealmakerHome";
import { parseSiteSettings } from "@/lib/site-settings";

export const Route = createFileRoute("/")({
  // The title and description follow Admin → Settings → General.
  head: ({ loaderData }) => {
    const general = loaderData?.settings.general;
    const title = `${general?.siteTitle ?? "Dealmaker"} — ${general?.tagline || "Book Dubai's best event talent"}`;
    return { links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@300;400;500;600;700&display=swap" }], meta: [
    { title },
    { name: "description", content: general?.tagline ? `${general.tagline}. Browse talent and request a quote from each artist's AI booking agent.` : "Discover singers, DJs and cultural acts across Dubai and the UAE. Browse talent and request a quote from each artist's AI booking agent." },
    { property: "og:title", content: title },
    { property: "og:description", content: "Find performers for weddings, corporate events and private parties with AI-assisted booking and quotes in AED." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] };
  },
  loader: async () => {
    // Settings that cannot be read leave the built-in title.
    const [catalog, featured, settings] = await Promise.all([getCatalog(), getFeatured(), getSiteSettings().catch(() => parseSiteSettings())]);
    return { catalog, featured, settings };
  },
  component: Home,
});

function Home() {
  const { catalog, featured } = Route.useLoaderData();
  return <DealmakerHome catalog={catalog} featured={featured} />;
}
