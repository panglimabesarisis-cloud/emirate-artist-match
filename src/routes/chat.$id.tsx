import { createFileRoute } from "@tanstack/react-router";
import { ClientChatRoom } from "@/components/chat/ClientChatRoom";

export const Route = createFileRoute("/chat/$id")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ k: typeof s["k"] === "string" ? s["k"] : "" }),
  head: () => ({ meta: [{ title: "Your quote conversation | Dealmaker" }, { name: "robots", content: "noindex" }, { name: "description", content: "Chat with your talent agent and review service invoices." }, { property: "og:title", content: "Your quote conversation | Dealmaker" }, { property: "og:description", content: "Your private booking conversation and invoices." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ChatPage,
});

function ChatPage() {
  const { id } = Route.useParams();
  const { k } = Route.useSearch();
  return <ClientChatRoom key={id} id={id} k={k} />;
}
