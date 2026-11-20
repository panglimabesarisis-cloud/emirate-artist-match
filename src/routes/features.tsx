import { createFileRoute } from "@tanstack/react-router";
import { FeaturesPage } from "@/components/site/FeaturesPage";
export const Route = createFileRoute("/features")({
 head: () => ({ meta: [
 {title: "Features | Dealmaker"},
 {name: "description", content: "Explore Dealmaker AI booking automation, wallet tracking and artist management."},
 {property: "og:title", content: "Features | Dealmaker"},
 {property: "og:description", content: "Explore Dealmaker AI booking automation, wallet tracking and artist management."},
 {property: "og:type", content: "website"},
 {name: "twitter:card", content: "summary"},
 ] }), component: FeaturesPage,
});
