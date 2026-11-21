import { createFileRoute } from "@tanstack/react-router";
import { ArtistGuidePage } from "@/components/site/ArtistGuidePage";

export const Route = createFileRoute("/why-artists-join")({
  head: () => ({ meta: [
    { title: "Why artists join | Dealmaker" },
    { name: "description", content: "Explore Dealmaker's artist profiles, AI booking agents, artist approval tools and shared booking workspace, with plan-based limits and demo-only payments." },
    { property: "og:title", content: "Why artists join | Dealmaker" },
    { property: "og:description", content: "Show your work, shape your AI enquiries and manage booking details while retaining control of every offer. Discover the tools available to Dealmaker artists." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ArtistBenefits,
});

function ArtistBenefits() { return <ArtistGuidePage kind="benefits" />; }