import { createFileRoute } from "@tanstack/react-router";
import { ForClientsPage } from "@/components/site/ForClientsPage";

export const Route = createFileRoute("/for-clients")({
  head: () => ({
    meta: [
      { title: "For clients: book UAE event talent | Dealmaker" },
      { name: "description", content: "Find UAE performers for weddings, corporate events and celebrations. Compare profiles, request free quotes and review artist-approved booking details. Payments are demo-only." },
      { property: "og:title", content: "For clients: book UAE event talent | Dealmaker" },
      { property: "og:description", content: "Explore talent, share your event brief and keep approved offers, invoices and booking details together with Dealmaker. Payments are currently demo-only." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForClientsPage,
});