import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Send } from "lucide-react";
import { getChat, sendClientMessage } from "@/lib/chat.functions";
import { PublicLayout } from "@/components/site/PublicLayout";
import { ArtistAvatar } from "@/components/site/ArtistCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/chat/$id")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ k: typeof s["k"] === "string" ? s["k"] : "" }),
  head: () => ({ meta: [{ title: "Your quote conversation | Dealmaker" }, { name: "robots", content: "noindex" }] }),
  component: ChatPage,
});

function ChatPage() {
  const { id } = Route.useParams();
  const { k } = Route.useSearch();
  const qc = useQueryClient();
  const get$ = useServerFn(getChat);
  const send$ = useServerFn(sendClientMessage);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const { data, error } = useQuery({
    queryKey: ["chat", id],
    queryFn: () => get$({ data: { id, key: k } }),
    refetchInterval: 5000,
  });
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [data?.messages.length, busy]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const t = text; setText("");
    try {
      const r = await send$({ data: { id, key: k, text: t } });
      if ("error" in r && r.error) toast.error(r.error);
      await qc.invalidateQueries({ queryKey: ["chat", id] });
    } catch { toast.error("Message failed. Please try again."); setText(t); }
    finally { setBusy(false); }
  };

  if (error) return <PublicLayout><div className="p-16 text-center">This conversation link is invalid.</div></PublicLayout>;
  const a = data?.artist;
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="text-sm text-muted-foreground">Save this page's link to come back to your conversation.</div>
        <div className="mt-4 rounded-2xl bg-card shadow-card overflow-hidden">
          <div className="bg-night text-night-foreground p-4 flex items-center gap-3">
            {a && <ArtistAvatar name={a.stage_name} hue={a.hue ?? 30} className="h-11 w-11 rounded-full text-sm" />}
            <div className="flex-1">
              <div className="font-semibold">{a?.stage_name ?? "…"}</div>
              <div className="text-xs opacity-75 inline-flex items-center gap-1">
                {data?.mode === "human" ? "The artist is handling this chat personally" : <><Bot className="h-3 w-3" /> AI assistant replying on the artist's behalf</>}
              </div>
            </div>
            {a && <Link to="/artist/$slug" params={{ slug: a.slug }} className="text-xs text-gold underline">View profile</Link>}
          </div>
          <div className="p-4 space-y-3 min-h-[420px] max-h-[60vh] overflow-y-auto">
            {data?.messages.map((m) =>
              m.sender === "system" ? (
                <div key={m.id} className="text-center text-xs text-muted-foreground">{m.body}</div>
              ) : (
                <div key={m.id} className={`flex ${m.sender === "client" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${m.sender === "client" ? "bg-primary text-primary-foreground" : "bg-muted"}`} dir="auto">
                    {m.sender !== "client" && <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{m.sender === "ai" ? "AI assistant" : a?.stage_name}</div>}
                    {m.body}
                  </div>
                </div>
              ),
            )}
            {busy && <div className="text-xs text-muted-foreground">Typing…</div>}
            <div ref={bottom} />
          </div>
          <div className="border-t p-3 flex gap-2">
            <Textarea rows={2} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Type your message…"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <Button onClick={send} disabled={busy || !text.trim()} className="self-end bg-gradient-gold text-gold-foreground"><Send className="h-4 w-4" /></Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">DEMO MODE · Phone numbers, emails and social handles are hidden automatically to keep you protected.</p>
      </div>
    </PublicLayout>
  );
}
