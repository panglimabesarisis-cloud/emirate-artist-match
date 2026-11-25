import { createFileRoute } from "@tanstack/react-router";
import { getCatalog, getFeatured } from "@/lib/public.functions";
import { DealmakerHome } from "@/components/home/DealmakerHome";

export const Route = createFileRoute("/")({
  head: () => ({ links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Manrope:wght@300;400;500;600;700&display=swap" }], meta: [
    { title: "Dealmaker — Book Dubai's best event talent" },
    { name: "description", content: "Discover singers, DJs and cultural acts across Dubai and the UAE. Browse talent and request a quote from each artist's AI booking agent." },
    { property: "og:title", content: "Dealmaker — Book Dubai's best event talent" },
    { property: "og:description", content: "Find performers for weddings, corporate events and private parties with AI-assisted booking and quotes in AED." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  loader: async () => {
    const [catalog, featured] = await Promise.all([getCatalog(), getFeatured()]);
    return { catalog, featured };
  },
  component: Home,
});

function Home() {
  return <DealmakerHome {...Route.useLoaderData()} />;
}
