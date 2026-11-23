import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { askPublicConcierge } from "@/lib/public.functions";
import { publicConciergeText, type ConciergeReply } from "@/lib/concierge-rules";
import { useI18n } from "@/lib/i18n";

type Turn = { id: number; role: "user" | "assistant"; text: string; reply?: ConciergeReply };
const prompts = ["Which singers can I book?", "How do booking and payment work?", "How do I register as an artist?"];

export function PublicConciergeChat() {
  const { t } = useI18n();
  const ask = useServerFn(askPublicConcierge);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const nextId = useRef(0);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const question: Turn = { id: nextId.current++, role: "user", text: publicConciergeText(text) };
    setTurns(previous => [...previous, question]);
    setDraft("");
    try {
      const result = await ask({ data: { message: text, history: turns.slice(-12).map(turn => ({ role: turn.role, text: turn.text })) } });
      if (!result.ok) {
        setError(t(result.error));
        setDraft(text);
        return;
      }
      setTurns(previous => [...previous, { id: nextId.current++, role: "assistant", text: result.reply.paragraphs.join("\n\n"), reply: result.reply }]);
    } catch {
      setError(t("The AI agent is unavailable right now. Please try again later."));
      setDraft(text);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <div className="booking-questions-chat">
    <header className="booking-chat-header"><Sparkles aria-hidden="true" /><div><strong>Dealmaker</strong><span>{t("AI Agent")}</span></div><Button variant="ghost" size="icon" disabled={busy || !turns.length} aria-label={t("New conversation")} title={t("New conversation")} onClick={() => { setTurns([]); setError(""); setDraft(""); }}><RotateCcw size={16} /></Button></header>
    <Conversation className="concierge-conversation" aria-label={t("AI Agent conversation")}>
      <ConversationContent className="booking-chat-thread">
        {!turns.length && <Message from="assistant"><MessageContent className="concierge-answer"><span className="concierge-sender"><Sparkles size={14} />Dealmaker</span><p>{t("Hello! Which artist are you looking for, or what would you like to know about booking or artist registration?")}</p></MessageContent></Message>}
        {turns.map(turn => <Message from={turn.role} key={turn.id}><MessageContent className={turn.role === "user" ? "concierge-question" : "concierge-answer"}>
          <span className="concierge-sender">{turn.role === "user" ? t("You") : "Dealmaker"}</span>
          <p className="concierge-text">{turn.text}</p>
          {!!turn.reply?.artists.length && <ul className="concierge-artists">{turn.reply.artists.map(artist => <li key={artist.slug}><a href={`/artist/${encodeURIComponent(artist.slug)}`}><strong>{artist.name}</strong><span>{artist.specialty} · {artist.location}</span><span>{t("Starting from")} AED {artist.startingPrice.toLocaleString()} {artist.rating !== null ? `· ★ ${artist.rating.toFixed(1)}` : ""}</span><ArrowRight size={16} aria-hidden="true" /></a></li>)}</ul>}
          {!!turn.reply?.links.length && <div className="concierge-links">{turn.reply.links.map(link => <a key={link.href} href={link.href}>{t(link.label)}<ArrowRight size={14} aria-hidden="true" /></a>)}</div>}
        </MessageContent></Message>)}
        {busy && <Message from="assistant"><MessageContent className="concierge-answer"><span role="status">{t("Dealmaker is thinking…")}</span></MessageContent></Message>}
      </ConversationContent>
    </Conversation>
    <div className="booking-chat-prompts">{prompts.map(prompt => <Button key={prompt} type="button" variant="outline" disabled={busy} onClick={() => void send(t(prompt))}><span>{t(prompt)}</span><ArrowRight size={14} aria-hidden="true" /></Button>)}</div>
    <div className="concierge-composer">
      {error && <p role="alert" className="concierge-error">{error}</p>}
      <PromptInput onSubmit={() => send(draft)}>
        <PromptInputBody><PromptInputTextarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={1000} disabled={busy} placeholder={t("Ask Dealmaker…")} aria-label={t("Message to Dealmaker AI Agent")} /></PromptInputBody>
        <PromptInputFooter><PromptInputSubmit status={busy ? "submitted" : "ready"} disabled={busy || !draft.trim()} aria-label={t("Send message")} /></PromptInputFooter>
      </PromptInput>
    </div>
  </div>;
}