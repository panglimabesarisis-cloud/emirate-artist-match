import { createFileRoute } from "@tanstack/react-router";
import { AiAgentPage } from "@/components/ai-page/AiAgentPage";
import { AiLock } from "@/components/ai-page/AiLock";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/ai/$slug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Personal AI Agent | Dealmaker" },
      { name: "description", content: "Your private Dealmaker Personal AI Agent." },
      { name: "robots", content: "noindex, nofollow" },
      { name: "theme-color", content: "#07090f" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Dealmaker" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      { rel: "manifest", href: "/ai.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  component: Page,
});

function Page() {
  const { slug } = Route.useParams();
  const { user, loading } = useAuth();
  return (
    <AiLock path={`/ai/${encodeURIComponent(slug)}`} signedIn={!!user} loading={loading}>
      {user && <AiAgentPage slug={slug} userId={user.id} email={user.email ?? ""} />}
    </AiLock>
  );
}
