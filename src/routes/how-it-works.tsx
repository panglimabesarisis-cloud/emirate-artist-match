import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/site/PublicLayout";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How it works | Dealmaker" },
      { name: "description", content: "How clients book talent and how artists get an AI manager on Dealmaker." },
      { property: "og:title", content: "How Dealmaker works" },
      { property: "og:description", content: "Search, request a free quote, book with confidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <PublicLayout>
      <div className="mx-auto max-w-4xl px-4 py-16">
        <h1 className="text-4xl md:text-5xl font-semibold">How it works</h1>
        <div className="mt-10 grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold text-gold">For clients</h2>
            <ol className="mt-4 space-y-3 list-decimal pl-5 text-muted-foreground">
              <li>Pick a category, emirate and event type.</li>
              <li>Compare verified profiles, packages and real reviews.</li>
              <li>Send a free quick quote — the artist's AI agent replies fast.</li>
              <li>Confirm, pay a deposit (demo) and enjoy your event.</li>
            </ol>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-gold">For artists</h2>
            <ol className="mt-4 space-y-3 list-decimal pl-5 text-muted-foreground">
              <li>Create your profile, packages and availability.</li>
              <li>Apply for verified badges with your documents.</li>
              <li>Choose which track-record stats are public.</li>
              <li>Let your AI booking agent handle inquiries 24/7.</li>
            </ol>
          </div>
        </div>
      </div>
    </PublicLayout>
  ),
});
