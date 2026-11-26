import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useOwnArtist } from "@/components/ai-page/AiAgentPage";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

/** Where the installed app opens: the signed-in talent's own AI agent page. */
export const Route = createFileRoute("/_authenticated/ai/")({
  head: () => ({ meta: [{ title: "Your AI agent | Dealmaker" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const artist = useOwnArtist(user?.id);
  if (artist.data) return <Navigate to="/ai/$slug" params={{ slug: artist.data.slug }} replace />;
  if (artist.isPending) return null;
  return <main className="grid min-h-dvh place-items-center gap-4 px-4 text-center"><p>{artist.error ? artist.error.message : "This page is for talent accounts."}</p><Button asChild variant="outline"><Link to="/dashboard">Back to dashboard</Link></Button></main>;
}
