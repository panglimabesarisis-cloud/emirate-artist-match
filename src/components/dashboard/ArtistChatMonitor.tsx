import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Hand, Send } from "lucide-react";
import { toast } from "sonner";
import { readArtistChat, changeArtistChatMode } from "@/lib/artist-chat.functions";
import { artistReply } from "@/lib/chat.functions";
import { decodeChatMessage } from "@/lib/chat-attachments";
import { artistChatFiles } from "@/lib/chat-files.functions";
import { ChatAttachments } from "@/components/chat/ChatAttachments";
import { decodeInvoice } from "@/lib/invoice";
import { InvoiceCard } from "@/components/site/InvoiceCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import "./studio.css";
import "./artist-chat-monitor.css";

export function ArtistChatMonitor({ id }: { id: string }) {
  const { t } = useI18n();
  const read$ = useServerFn(readArtistChat);
  const mode$ = useServerFn(changeArtistChatMode);
  const reply$ = useServerFn(artistReply);
  const files$ = useServerFn(artistChatFiles);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const query = useQuery({ queryKey: ["artist-chat-monitor", id], queryFn: () => read$({ data: { id } }), refetchInterval: 4000, retry: false });
  const files = useQuery({ queryKey: ["artist-monitor-files", id, query.data?.messages.length], queryFn: () => files$({ data: { id } }), enabled: !!query.data, staleTime: 240000 });
  const canReply = query.data?.chat.mode === "human" && !!query.data.chat.chat_operator_id;
  useEffect(() => { document.documentElement.classList.add("dm-dash"); return () => document.documentElement.classList.remove("dm-dash"); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [query.data?.messages.length]);
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["artist-chat-monitor", id] }); void qc.invalidateQueries({ queryKey: ["inbox"] }); };
  const mode = async (value: "ai" | "human") => {
    setBusy(true);
    try { await mode$({ data: { id, mode: value } }); setText(""); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : t("Could not change chat mode")); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (!canReply || !text.trim() || busy) return;
    setBusy(true);
    try { await reply$({ data: { id, text } }); setText(""); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : t("Reply failed")); }
    finally { setBusy(false); }
  };
  return <main className="artist-chat-monitor">
    <header className="artist-chat-top"><div><h1>{query.data?.chat.client_name ?? query.data?.chat.quote_requests?.name ?? t("Booking chat")}</h1><span>{t(canReply ? "You are handling this chat" : query.data?.chat.handover_requested_at ? "Waiting for artist takeover" : "AI is handling this chat")}</span></div>
      {query.data && <Button disabled={busy} onClick={() => void mode(canReply ? "ai" : "human")}>{canReply ? <Bot /> : <Hand />}{t(canReply ? "Return to AI" : "Take Over Chat")}</Button>}
    </header>
    <div className="artist-chat-history" role="log" aria-live="polite" aria-label={t("Conversation")}>
      {query.isPending && <p>{t("Loading…")}</p>}{query.error && <p role="alert">{query.error.message}</p>}
      {query.data?.messages.map(message => { const invoice = decodeInvoice(message.body); return <article key={message.id} className={`artist-chat-bubble artist-chat-${message.sender}`}><small>{t(message.sender === "artist" ? "Artist" : message.sender === "ai" ? "AI Agent" : message.sender === "client" ? "Client" : "System")}</small>{invoice ? <InvoiceCard inv={invoice} /> : <p dir="auto">{decodeChatMessage(message.body).text}</p>}<ChatAttachments files={files.data?.find(file => file.id === message.id)?.files ?? []} /><time>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></article>; })}<div ref={end} />
    </div>
    <form className="artist-chat-composer" onSubmit={event => { event.preventDefault(); void send(); }}><Textarea aria-label={t("Message")} disabled={!canReply || busy} value={text} maxLength={2000} onChange={event => setText(event.target.value)} /><Button type="submit" disabled={!canReply || busy || !text.trim()} aria-label={t("Send message")}><Send /></Button></form>
  </main>;
}