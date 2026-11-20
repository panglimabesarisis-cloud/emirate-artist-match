import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/components/site/TermsPage";
export const Route = createFileRoute("/terms")({
 head: () => ({ meta: [
 {title: "Terms of Service | Dealmaker"},
 {name: "description", content: "Read draft terms for the Dealmaker demo talent marketplace in the UAE."},
 {property: "og:title", content: "Terms of Service | Dealmaker"},
 {property: "og:description", content: "Read draft terms for the Dealmaker demo talent marketplace in the UAE."},
 {property: "og:type", content: "website"},
 {name: "twitter:card", content: "summary"},
 ] }), component: TermsPage,
});
