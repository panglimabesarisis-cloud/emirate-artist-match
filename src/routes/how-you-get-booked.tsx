import { createFileRoute } from "@tanstack/react-router";
import { ArtistGuidePage } from "@/components/site/ArtistGuidePage";

export const Route = createFileRoute("/how-you-get-booked")({
  head: () => ({ meta: [
    { title: "How you get booked: artist guide | Dealmaker" },
    { name: "description", content: "Learn how to register your Dealmaker artist profile, collect event briefs, approve offers and track bookings across the UAE. Payments are demo-only." },
    { property: "og:title", content: "How you get booked: artist guide | Dealmaker" },
    { property: "og:description", content: "From profile approval to performance: a practical artist booking journey with AI enquiries, artist-reviewed offers and linked documents." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: BookingGuide,
});

function BookingGuide() { return <ArtistGuidePage kind="booking" />; }