import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useOwnArtist } from "@/components/ai-page/AiAgentPage";
import { AiLock } from "@/components/ai-page/AiLock";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

/** Where the installed app opens: the signed-in talent's own AI agent page. */
export const Route = createFileRoute("/ai/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Personal AI Agent | Dealmaker" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: Page,
});

function Page() {
  const { user, loading } = useAuth();
  return <AiLock path="/ai" signedIn={!!user} loading={loading}><Own userId={user?.id} /></AiLock>;
}

function Own({ userId }: { userId: string | undefined }) {
  const artist = useOwnArtist(userId);
  if (artist.data) return <Navigate to="/ai/$slug" params={{ slug: artist.data.slug }} replace />;
  if (artist.isPending) return null;
  return <main className="grid min-h-dvh place-items-center gap-4 px-4 text-center"><p>{artist.error ? artist.error.message : "This page is for talent accounts."}</p><Button asChild variant="outline"><Link to="/dashboard">Back to dashboard</Link></Button></main>;
}
