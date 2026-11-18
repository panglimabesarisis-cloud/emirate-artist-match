import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Send } from "lucide-react";
import { getChat, sendClientMessage } from "@/lib/chat.functions";
import { getConversationBookings } from "@/lib/bookings.functions";
import { aed } from "@/lib/format";
import { PublicLayout } from "@/components/site/PublicLayout";
import { SiteHeader } from "@/components/site/SiteHeader";
import { ArtistAvatar } from "@/components/site/ArtistCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";

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
  const { t: tr } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const { data, error } = useQuery({
    queryKey: ["chat", id],
    queryFn: () => get$({ data: { id, key: k } }),
    refetchInterval: 5000,
  });
  const offers$ = useServerFn(getConversationBookings);
  const { data: offers } = useQuery({ queryKey: ["chat-offers", id], queryFn: () => offers$({ data: { id, key: k } }), refetchInterval: 10000, enabled: !!k });
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [data?.messages.length, busy]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const t = text; setText("");
    try {
      const r = await send$({ data: { id, key: k, text: t } });
      if ("error" in r && r.error) toast.error(r.error);
      await qc.invalidateQueries({ queryKey: ["chat", id] });
    } catch { toast.error(tr("Message failed. Please try again.")); setText(t); }
    finally { setBusy(false); }
  };

  if (error) return <PublicLayout><div className="p-16 text-center">{tr("This conversation link is invalid.")}</div></PublicLayout>;
  const a = data?.artist;
  return (
    <div className="flex h-dvh flex-col bg-background">
      <SiteHeader />
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          {a && <ArtistAvatar name={a.stage_name} hue={a.hue ?? 30} className="h-10 w-10 rounded-full text-sm" />}
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{a?.stage_name ?? "…"}</div>
            <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {data?.mode === "human" ? tr("The artist is handling this chat personally") : <><Bot className="h-3 w-3 text-gold" /> {tr("AI assistant replying on the artist's behalf")}</>}
            </div>
          </div>
          {a && <Link to="/artist/$slug" params={{ slug: a.slug }} className="text-xs text-gold underline">{tr("View profile")}</Link>}
        </div>
      </div>
      <div ref={box} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
          <div className="text-center text-xs text-muted-foreground">{tr("Save this page's link to come back to your conversation.")}</div>
          {offers && offers.length > 0 && (
            <div className="space-y-2">
              {offers.map((o) => o.status === "inquiry" ? (
                <div key={o.id} className="rounded-xl border bg-card p-4 shadow-card"><div className="font-semibold">{tr("Booking details")} · {o.package_title}</div><div className="text-xs text-muted-foreground">{o.event_date} · {tr("waiting for the artist to approve")}</div></div>
              ) : (
                <Link key={o.id} to="/booking/$id" params={{ id: o.id }} search={{ k: o.access_key }} className="flex items-center justify-between rounded-xl border border-gold/40 bg-card p-4 shadow-card hover:border-gold">
                  <div><div className="font-semibold">{tr("Booking offer")} · {o.package_title}</div><div className="text-xs text-muted-foreground">{o.event_date} · {aed(Number(o.total))} {tr("incl. VAT")}</div></div>
                  <span className="text-xs font-medium uppercase tracking-wide text-gold">{o.status === "quoted" ? tr("Review & pay") : o.status}</span>
                </Link>
              ))}
            </div>
          )}
          {data?.messages.map((m) =>
            m.sender === "system" ? (
              <div key={m.id} className="text-center text-xs text-muted-foreground">{m.body}</div>
            ) : m.sender === "client" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-primary px-4 py-2.5 text-sm text-primary-foreground" dir="auto">{m.body}</div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-gold text-gold-foreground">
                  {m.sender === "ai" ? <Bot className="h-4 w-4" /> : <span className="text-xs font-bold">{a?.stage_name?.[0]}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">{m.sender === "ai" ? tr("AI assistant") : a?.stage_name}</div>
                  <div className="whitespace-pre-wrap text-[15px] leading-relaxed" dir="auto">{m.body}</div>
                </div>
              </div>
            ),
          )}
          {busy && (
            <div className="flex gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-gold text-gold-foreground"><Bot className="h-4 w-4" /></div>
              <div className="flex items-center gap-1 pt-2" aria-label={tr("Typing…")}>{[0, 1, 2].map((n) => <span key={n} className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${n * 0.15}s` }} />)}</div>
            </div>
          )}
        </div>
      </div>
      <div className="bg-background px-4 pb-4 pt-2">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-3xl border bg-card p-2 shadow-card focus-within:border-gold">
            <Textarea autoFocus rows={1} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder={tr("Type your message…")}
              className="max-h-40 min-h-[44px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <Button onClick={send} disabled={busy || !text.trim()} size="icon" aria-label="Send" className="h-10 w-10 shrink-0 rounded-full bg-gradient-gold text-gold-foreground"><Send className="h-4 w-4" /></Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">{tr("DEMO MODE · Phone numbers, emails and social handles are hidden automatically to keep you protected.")}</p>
        </div>
      </div>
    </div>
  );
}
