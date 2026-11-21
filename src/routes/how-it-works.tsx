import { createFileRoute } from "@tanstack/react-router";
import { HowItWorksPage } from "@/components/site/HowItWorksPage";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How it works | Dealmaker" },
      { name: "description", content: "Discover how to find UAE talent, request quotes and follow artist-approved bookings, or set up your Dealmaker profile, AI agent and workspace. Payments are demo-only." },
      { property: "og:title", content: "How it works | Dealmaker" },
      { property: "og:description", content: "From first enquiry to final encore: talent discovery, artist-approved quotes, demo booking payments and an AI-powered artist workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HowItWorksPage,
});
