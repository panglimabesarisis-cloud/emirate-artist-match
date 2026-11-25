import { createFileRoute } from "@tanstack/react-router";
import { ArtistChatMonitor } from "@/components/dashboard/ArtistChatMonitor";

export const Route = createFileRoute("/_authenticated/dashboard_/chat/$id")({
  head: () => ({ meta: [
    { title: "Monitor booking chat | Dealmaker" },
    { name: "description", content: "Private artist conversation monitoring and explicit AI takeover controls." },
    { name: "robots", content: "noindex" },
    { property: "og:title", content: "Monitor booking chat | Dealmaker" },
    { property: "og:description", content: "Private artist booking conversation." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: MonitorPage,
});
function MonitorPage() { const { id } = Route.useParams(); return <ArtistChatMonitor key={id} id={id} />; }