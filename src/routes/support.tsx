import { createFileRoute } from "@tanstack/react-router";
import { SupportPage } from "@/components/site/SupportPage";
export const Route = createFileRoute("/support")({
 head: () => ({ meta: [
 {title: "Support | Dealmaker"},
 {name: "description", content: "Find answers about Dealmaker bookings, artist profiles and demo payments."},
 {property: "og:title", content: "Support | Dealmaker"},
 {property: "og:description", content: "Find answers about Dealmaker bookings, artist profiles and demo payments."},
 {property: "og:type", content: "website"},
 {name: "twitter:card", content: "summary"},
 ] }), component: SupportPage,
});
