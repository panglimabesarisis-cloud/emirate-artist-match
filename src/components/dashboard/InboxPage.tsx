import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Hand, Inbox as InboxIcon, Search, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { artistReply } from "@/lib/chat.functions";
import { artistChatFiles } from "@/lib/chat-files.functions";
import { decodeChatMessage } from "@/lib/chat-attachments";
import { decodeInvoice } from "@/lib/invoice";
import { clientNameFromMessages, inboxLabelFor, INBOX_LABELS, type InboxLabel } from "@/lib/chat-client-name";
import { InvoiceCard } from "@/components/site/InvoiceCard";
import { ChatAttachments } from "@/components/chat/ChatAttachments";
import { useI18n } from "@/lib/i18n";
import { initials } from "@/lib/format";
import "./inbox.css";

const hhmm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");

/** Highlights the search word inside a name or preview. */
function Hit({ text, needle }: { text: string; needle: string }) {
  const i = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + needle.length)}</mark>{text.slice(i + needle.length)}</>;
}

export function Inbox({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const reply$ = useServerFn(artistReply);
  const files$ = useServerFn(artistChatFiles);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "ai" | "human">("all");
  const [labelFilter, setLabelFilter] = useState<"" | InboxLabel>("");
  const [open, setOpen] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [text, setText] = useState("");
  const msgsEnd = useRef<HTMLDivElement>(null);
  const needle = search.trim().toLowerCase();

  const { data: convos } = useQuery({
    queryKey: ["inbox", artistId],
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select("id, mode, ai_replies, last_message_at, quote_requests(name, event_date)").eq("artist_id", artistId).order("last_message_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10000,
  });
  const convoIds = useMemo(() => (convos ?? []).map((c) => c.id), [convos]);
  const idsKey = convoIds.join(",");

  const { data: lastMsgs } = useQuery({
    queryKey: ["inbox-last", artistId, idsKey],
    enabled: convoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("messages").select("conversation_id, sender, body, created_at").in("conversation_id", convoIds).order("created_at", { ascending: false }).limit(Math.min(1000, convoIds.length * 4));
      if (error) throw error;
      const map = new Map<string, { sender: string; body: string }>();
      for (const m of data ?? []) if (!map.has(m.conversation_id)) map.set(m.conversation_id, m);
      return map;
    },
    refetchInterval: 15000,
  });

  /** What each client wrote, to find their name when the chat has no booking or quote request yet. */
  const { data: clientTexts } = useQuery({
    queryKey: ["inbox-client-texts", artistId, idsKey],
    enabled: convoIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("messages").select("conversation_id, body").eq("sender", "client").in("conversation_id", convoIds).order("created_at", { ascending: true }).limit(3000);
      if (error) throw error;
      const map = new Map<string, string[]>();
      for (const m of data ?? []) map.set(m.conversation_id, [...(map.get(m.conversation_id) ?? []), decodeChatMessage(m.body).text]);
      return map;
    },
    refetchInterval: 30000,
  });

  const { data: bookings } = useQuery({
    queryKey: ["inbox-bookings", artistId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("conversation_id, client_name, status, total, paid_amount, event_date").eq("artist_id", artistId).not("conversation_id", "is", null).is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const rows = useMemo(() => (convos ?? []).map((c) => {
    const own = (bookings ?? []).filter((b) => b.conversation_id === c.id);
    const booked = own.find((b) => b.client_name && !/^(client|direct chat)$/i.test(b.client_name.trim()))?.client_name;
    const name = c.quote_requests?.name || booked || clientNameFromMessages(clientTexts?.get(c.id) ?? []) || `${t("Direct chat")} · ${c.id.slice(0, 8)}`;
    const named = !name.startsWith(`${t("Direct chat")} ·`);
    const date = c.quote_requests?.event_date ?? own.find((b) => b.event_date)?.event_date ?? null;
    return { ...c, name, named, date, label: inboxLabelFor(own) };
  }), [convos, bookings, clientTexts, t]);

  const lastLine = (id: string) => {
    const m = lastMsgs?.get(id);
    if (!m) return "";
    return `${m.sender === "ai" ? `${t("AI")}: ` : m.sender === "artist" ? `${t("You")}: ` : ""}${decodeChatMessage(m.body).text}`;
  };

  const visible = rows.filter((c) => (!labelFilter || c.label === labelFilter) && (filter === "all" || c.mode === filter)
    && (!needle || `${c.name} ${lastLine(c.id)}`.toLowerCase().includes(needle)));

  useEffect(() => {
    if (!open && rows.length > 0) setOpen(rows[0]!.id);
  }, [rows, open]);

  const { data: msgs } = useQuery({
    queryKey: ["inbox-msgs", open],
    enabled: !!open,
    queryFn: async () => {
      if (!open) return [];
      const { data, error } = await supabase.from("messages").select("id, sender, body, created_at").eq("conversation_id", open).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5000,
  });
  const { data: attachments } = useQuery({ queryKey: ["inbox-files", open, msgs?.length], enabled: !!open, queryFn: () => open ? files$({ data: { id: open } }) : Promise.resolve([]), refetchInterval: 300000 });
  useEffect(() => { msgsEnd.current?.scrollIntoView({ block: "end" }); }, [open, msgs?.length]);

  const current = rows.find((c) => c.id === open);
  const mine = current?.mode === "human";
  const setMode = async (mode: string) => {
    if (!open) return;
    const { error } = await supabase.from("conversations").update({ mode }).eq("id", open);
    if (error) { toast.error(t("Could not change chat mode")); return; }
    toast.success(mode === "human" ? t("You are now handling this chat.") : t("Your AI agent is answering again."));
    void qc.invalidateQueries({ queryKey: ["inbox", artistId] });
  };
  const send = async () => {
    if (!text.trim() || !open) return;
    try {
      await reply$({ data: { id: open, text } });
      setText("");
      if (current?.mode === "ai") await setMode("human");
      void qc.invalidateQueries({ queryKey: ["inbox-msgs", open] });
    } catch { toast.error(t("Reply failed")); }
  };
  const pick = (id: string) => { setOpen(id); setShowChat(true); };

  const tabs: ["all" | "ai" | "human", string][] = [["all", "All"], ["ai", "AI handling"], ["human", "You"]];
  const aiCount = (n: number) => `${n} ${t(n === 1 ? "AI reply" : "AI replies")}`;

  return (
    <div className={`ibx-root${showChat ? " open" : ""}`}>
      <section className="ibx-list" aria-label={t("Conversations")}>
        <div className="l-head">
          <div className="l-title"><h2 className="ibx-serif">{t("Inbox")}</h2><span className="l-n">{rows.length} {t(rows.length === 1 ? "chat" : "chats")}</span></div>
          <label className="srch"><Search aria-hidden="true" /><span className="sr-only">{t("Search chats")}</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search chats or messages")} autoComplete="off" /></label>
          <div className="tabs" role="tablist" aria-label={t("Filter chats")}>
            {tabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>{t(label)}</button>)}
          </div>
          <div className="lfil" role="group" aria-label={t("Filter by label")}>
            <button type="button" className="any" aria-pressed={labelFilter === ""} onClick={() => setLabelFilter("")}>{t("All")}</button>
            {(Object.keys(INBOX_LABELS) as InboxLabel[]).map((k) => <button key={k} type="button" className={k} aria-pressed={labelFilter === k} onClick={() => setLabelFilter(k)}>{t(INBOX_LABELS[k])}</button>)}
          </div>
        </div>
        <ul className="threads">
          {visible.map((c) => {
            const preview = lastLine(c.id);
            return (
              <li key={c.id} className={`th${c.id === open ? " on" : ""}`}>
                <button type="button" className="th-b" aria-current={c.id === open} onClick={() => pick(c.id)}>
                  <span className="av2" aria-hidden="true">{c.named ? initials(c.name) : "D"}<i className={c.mode === "human" ? "you" : ""}>{c.mode === "human" ? t("YOU") : t("AI")}</i></span>
                  <span className="th-t">
                    <span className="th-r1"><b><Hit text={c.name} needle={needle} /></b><time>{hhmm(c.last_message_at)}</time></span>
                    <span className="th-pv">{preview ? <Hit text={preview} needle={needle} /> : t("No messages yet")}</span>
                    <span className="th-meta">{c.date ?? t("date TBC")} · {aiCount(c.ai_replies)}</span>
                    <span className="th-lbl"><span className={`lbl ${c.label}`}>{t(INBOX_LABELS[c.label])}</span></span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {visible.length === 0 && (
          <div className="l-empty"><span className="orb"><Search aria-hidden="true" /></span><b className="ibx-serif">{t(rows.length ? "No chats found" : "Inbox is empty")}</b><p>{t(rows.length ? "Try another word or clear the search." : "New enquiries from clients will appear here.")}</p></div>
        )}
      </section>

      <section className={`ibx-conv${mine ? " mine" : ""}`} aria-label={t("Conversation")}>
        {current ? <>
          <header className="c-head">
            <button type="button" className="c-back" aria-label={t("Back to chats")} onClick={() => setShowChat(false)}><ArrowLeft className="size-[18px] rtl:rotate-180" /></button>
            <div className="c-who">
              <span className="c-av" aria-hidden="true">{current.named ? initials(current.name) : "D"}</span>
              <div>
                <span className="c-name"><b>{current.name}</b><span className={`lbl ${current.label}`}>{t(INBOX_LABELS[current.label])}</span></span>
                <small>{t("Event")} {current.date ?? t("date TBC")} · {aiCount(current.ai_replies)}</small>
              </div>
            </div>
            <div className="c-act">
              <span className="mode"><span className="dot" /><span>{t(mine ? "You are handling this chat" : "AI is handling this chat")}</span></span>
              <button type="button" className="btn btn-line" onClick={() => void setMode(mine ? "ai" : "human")}><Hand className="size-4" /><span>{t(mine ? "Hand back to AI" : "Take over")}</span></button>
            </div>
          </header>
          <div className="msgs" aria-live="polite">
            {msgs?.map((m) => {
              const inv = decodeInvoice(m.body);
              if (m.sender === "system" && !inv) return <span key={m.id} className="sys">{m.body}</span>;
              const who = m.sender === "ai" ? "ai" : m.sender === "artist" ? "you" : "client";
              return (
                <div key={m.id} className={`m ${who}`} dir="auto">
                  <span className="who">{t(who === "ai" ? "AI assistant" : who === "you" ? "You" : "Client")}</span>
                  <div className="bub">{inv ? <InvoiceCard inv={inv} /> : <>{decodeChatMessage(m.body).text}<ChatAttachments files={attachments?.find((item) => item.id === m.id)?.files ?? []} /></>}</div>
                  <time>{hhmm(m.created_at)}</time>
                </div>
              );
            })}
            <div ref={msgsEnd} />
          </div>
          <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <div className="cmp-note">{t("Replying here takes the chat over from your AI agent.")}</div>
            <div className="cmp-row">
              <label className="sr-only" htmlFor="ibx-reply">{t("Reply personally")}</label>
              <textarea id="ibx-reply" rows={1} maxLength={2000} value={text} placeholder={`${t("Reply personally")}…`} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
              <button type="submit" className="btn btn-gold" disabled={!text.trim()} aria-label={t("Send")}><Send className="size-[17px]" /><span>{t("Send")}</span></button>
            </div>
          </form>
        </> : (
          <div className="c-empty"><span className="orb"><InboxIcon aria-hidden="true" /></span><b className="ibx-serif">{t("No chat selected")}</b><p>{t("Pick a conversation on the left. Your AI agent keeps answering in the meantime.")}</p></div>
        )}
      </section>
    </div>
  );
}
