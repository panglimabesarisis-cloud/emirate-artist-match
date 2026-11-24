import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronDown, Hand, Inbox as InboxIcon, Search, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { artistReply } from "@/lib/chat.functions";
import { changeArtistChatMode } from "@/lib/artist-chat.functions";
import { artistChatFiles } from "@/lib/chat-files.functions";
import { decodeChatMessage } from "@/lib/chat-attachments";
import { decodeInvoice } from "@/lib/invoice";
import { clientNameFromMessages, inboxLabelFor, INBOX_LABELS, type InboxLabel } from "@/lib/chat-client-name";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { InvoiceCard } from "@/components/site/InvoiceCard";
import { ChatAttachments } from "@/components/chat/ChatAttachments";
import { useI18n } from "@/lib/i18n";
import { initials } from "@/lib/format";
import { useAuth } from "@/hooks/use-auth";
import "./inbox.css";
import "./chat-fields.css";

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
  const { user } = useAuth();
  const reply$ = useServerFn(artistReply);
  const mode$ = useServerFn(changeArtistChatMode);
  const files$ = useServerFn(artistChatFiles);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "ai" | "human">("all");
  const [labelFilter, setLabelFilter] = useState<"" | InboxLabel>("");
  const [open, setOpen] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [ask, setAsk] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const msgsEnd = useRef<HTMLDivElement>(null);
  const needle = search.trim().toLowerCase();

  const { data: convos } = useQuery({
    queryKey: ["inbox", artistId],
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select("id, mode, chat_operator_id, ai_replies, last_message_at, label, client_name, quote_requests(name, event_date)").eq("artist_id", artistId).order("last_message_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10000,
  });
  const { data: deletionAccess } = useQuery({
    queryKey: ["inbox-deletion-access", artistId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [owner, eligible] = await Promise.all([
        supabase.rpc("is_artist_owner", { _artist: artistId }),
        supabase.rpc("inbox_deletable_conversations", { _artist: artistId }),
      ]);
      if (owner.error) throw owner.error;
      if (eligible.error) throw eligible.error;
      return { owner: owner.data === true, ids: eligible.data ?? [] };
    },
    refetchInterval: 10000,
  });
  const canDelete = deletionAccess?.owner === true;
  const deletable = new Set(deletionAccess?.ids ?? []);
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
    const name = c.quote_requests?.name || c.client_name || booked || clientNameFromMessages(clientTexts?.get(c.id) ?? []) || `${t("Direct chat")} · ${c.id.slice(0, 8)}`;
    const named = !name.startsWith(`${t("Direct chat")} ·`);
    const date = c.quote_requests?.event_date ?? own.find((b) => b.event_date)?.event_date ?? null;
    return { ...c, name, named, date, label: (c.label as InboxLabel | null) ?? inboxLabelFor(own), manualLabel: c.label !== null };
  }), [convos, bookings, clientTexts, t]);

  const lastLine = (id: string) => {
    const m = lastMsgs?.get(id);
    if (!m) return "";
    return `${m.sender === "ai" ? `${t("AI")}: ` : m.sender === "artist" ? `${t("You")}: ` : ""}${decodeChatMessage(m.body).text}`;
  };

  const visible = rows.filter((c) => (!labelFilter || c.label === labelFilter) && (filter === "all" || c.mode === filter)
    && (!needle || `${c.name} ${lastLine(c.id)}`.toLowerCase().includes(needle)));

  const selectable = visible.filter((c) => canDelete && deletable.has(c.id));
  const selectedIds = picked.filter((id) => canDelete && deletable.has(id));

  useEffect(() => {
    const first = rows[0];
    if (!open && first) setOpen(first.id);
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
  const mine = current?.mode === "human" && current.chat_operator_id === user?.id;
  const setMode = async (mode: "ai" | "human") => {
    if (!open) return;
    try { await mode$({ data: { id: open, mode } }); }
    catch (error) { toast.error(error instanceof Error ? error.message : t("Could not change chat mode")); return; }
    setText("");
    toast.success(mode === "human" ? t("You are now handling this chat.") : t("Your AI agent is answering again."));
    void qc.invalidateQueries({ queryKey: ["inbox", artistId] });
  };
  const send = async () => {
    if (!mine || !text.trim() || !open) return;
    try {
      await reply$({ data: { id: open, text } });
      setText("");
      void qc.invalidateQueries({ queryKey: ["inbox-msgs", open] });
    } catch { toast.error(t("Reply failed")); }
  };
  const pick = (id: string) => { setOpen(id); setShowChat(true); };
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["inbox", artistId] }); void qc.invalidateQueries({ queryKey: ["inbox-last", artistId] }); void qc.invalidateQueries({ queryKey: ["inbox-deletion-access", artistId] }); };
  const setLabel = async (id: string, label: InboxLabel | null) => {
    const { error } = await supabase.rpc("set_conversation_label", { _id: id, _label: label as string });
    if (error) { toast.error(t("Could not change the label")); return; }
    toast.success(label ? `${t("Labelled")} "${t(INBOX_LABELS[label])}"` : t("Label removed"));
    refresh();
  };
  const hide = async () => {
    const ids = (ask ?? []).filter((id) => canDelete && deletable.has(id)).slice(0, 200);
    if (ids.length === 0) return;
    setBusy(true);
    const { data: hiddenCount, error } = await supabase.rpc("soft_delete_conversations", { _ids: ids });
    setBusy(false);
    setAsk(null);
    if (error) { toast.error(t("Delete failed")); return; }
    if (!hiddenCount) { refresh(); toast.error(t("Paid chats cannot be deleted. Only the artist owner can delete unpaid chats.")); return; }
    setPicked((cur) => cur.filter((id) => !ids.includes(id)));
    if (open && ids.includes(open)) { setOpen(null); setShowChat(false); }
    refresh();
    toast(hiddenCount > 1 ? `${hiddenCount} ${t("chats deleted")}` : t("Chat deleted"), { duration: 6000, action: { label: t("Undo"), onClick: () => { void supabase.rpc("restore_conversations", { _ids: ids }).then(() => refresh()); } } });
  };
  const togglePick = (id: string, on?: boolean) => setPicked((cur) => (on ?? !cur.includes(id)) ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter((x) => x !== id));
  const labelMenu = (id: string, current: InboxLabel | null, trigger: React.ReactNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60 rounded-[18px] border-[rgba(246,239,226,.16)] bg-[rgba(16,21,38,.98)] p-2">
        {(Object.keys(INBOX_LABELS) as InboxLabel[]).map((k) => (
          <DropdownMenuItem key={k} onSelect={() => void setLabel(id, k)} className="flex items-center justify-between rounded-xl px-2.5 py-2"><span className={`lbl ${k}`}>{t(INBOX_LABELS[k])}</span>{current === k && <Check className="h-4 w-4 text-[#e8b04a]" />}</DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => void setLabel(id, null)} className="mt-1 rounded-xl px-2.5 py-2 text-[13px] text-muted-foreground">{t("Reset to automatic label")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const tabs: ["all" | "ai" | "human", string][] = [["all", "All"], ["ai", "Ai"], ["human", "You"]];
  const aiCount = (n: number) => `${n} ${t(n === 1 ? "AI reply" : "AI replies")}`;

  return (
    <div className={`ibx-root${showChat ? " open" : ""}`}>
      <section className="ibx-list" aria-label={t("Conversations")}>
        <div className="l-head">
          <div className="l-title"><h2 className="ibx-serif">{t("Inbox")}</h2><span className="l-n">{rows.length} {t(rows.length === 1 ? "chat" : "chats")}</span>
          </div>
          <label className="srch"><Search aria-hidden="true" /><span className="sr-only">{t("Search chats")}</span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search chats or messages")} autoComplete="off" /></label>
          <div className="tabs" role="tablist" aria-label={t("Filter chats")}>
            {tabs.map(([value, label]) => <Button variant="ghost" key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>{t(label)}</Button>)}
          </div>
          <div className="lfil" role="group" aria-label={t("Filter by label")}>
            <Button variant="ghost" type="button" className="any" aria-pressed={labelFilter === ""} onClick={() => setLabelFilter("")}>{t("All")}</Button>
            {(Object.keys(INBOX_LABELS) as InboxLabel[]).map((k) => <Button variant="ghost" key={k} type="button" className={k} aria-pressed={labelFilter === k} onClick={() => setLabelFilter(k)}>{t(INBOX_LABELS[k])}</Button>)}
          </div>
        </div>
        {canDelete && <div className="bulk">
            <label className="ck"><Checkbox className="inbox-checkbox" disabled={selectable.length === 0} checked={selectable.length > 0 && selectable.every((c) => selectedIds.includes(c.id)) ? true : selectable.some((c) => selectedIds.includes(c.id)) ? "indeterminate" : false} onCheckedChange={(checked) => setPicked(checked === true ? selectable.slice(0, 200).map((c) => c.id) : [])} />{t("Select all")}</label>
            <Button variant="destructive" type="button" className="btn btn-danger" disabled={selectedIds.length === 0} onClick={() => setAsk(selectedIds.slice(0, 200))}><Trash2 className="size-[15px]" />{t("Delete")} {selectedIds.length ? `(${selectedIds.length})` : ""}</Button>
        </div>}
        <ul className={`threads${canDelete ? " selecting" : ""}`}>
          {visible.map((c) => {
            const preview = lastLine(c.id);
            return (
              <li key={c.id} className={`th${c.id === open ? " on" : ""}`}>
                <div role="button" tabIndex={0} className="th-b" aria-current={c.id === open}
                  onClick={() => pick(c.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(c.id); } }}>
                  {canDelete && <span className="ck" title={!deletable.has(c.id) ? t("Paid chats cannot be deleted") : undefined} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><Checkbox className="inbox-checkbox" disabled={!deletable.has(c.id) || (selectedIds.length >= 200 && !selectedIds.includes(c.id))} aria-label={`${t("Select")} ${c.name}`} checked={selectedIds.includes(c.id)} onCheckedChange={(checked) => togglePick(c.id, checked === true)} /></span>}
                  <span className="av2" aria-hidden="true">{c.named ? initials(c.name) : "D"}<i className={c.mode === "human" ? "you" : ""}>{c.mode === "human" ? t("YOU") : t("AI")}</i></span>
                  <span className="th-t">
                    <span className="th-r1"><b><Hit text={c.name} needle={needle} /></b><time>{hhmm(c.last_message_at)}</time></span>
                    <span className="th-pv">{preview ? <Hit text={preview} needle={needle} /> : t("No messages yet")}</span>
                    <span className="th-meta">{c.date ?? t("date TBC")} · {aiCount(c.ai_replies)}</span>
                    <span className="th-lbl">{labelMenu(c.id, c.manualLabel ? c.label : null, <button type="button" className="lbl-btn" aria-label={`${t("Label for")} ${c.name}: ${t(INBOX_LABELS[c.label])}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><span className={`lbl ${c.label}`}>{t(INBOX_LABELS[c.label])}</span><ChevronDown className="size-3" aria-hidden="true" /></button>)}</span>
                  </span>
                </div>
                {canDelete && deletable.has(c.id) && selectedIds.length === 0 && <Button variant="ghost" type="button" className="th-del" aria-label={`${t("Delete")} ${c.name}`} onClick={() => setAsk([c.id])}><Trash2 className="size-4" /></Button>}
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
                {labelMenu(current.id, current.manualLabel ? current.label : null, <button type="button" className="c-name" aria-label={`${t("Label for")} ${current.name}: ${t(INBOX_LABELS[current.label])}`}><b>{current.name}</b><span className={`lbl ${current.label}`}>{t(INBOX_LABELS[current.label])}</span><ChevronDown className="size-2.5 text-[#e8b04a]" aria-hidden="true" /></button>)}
                <small>{t("Event")} {current.date ?? t("date TBC")} · {aiCount(current.ai_replies)}</small>
              </div>
            </div>
            <div className="c-act">
              <span className="mode"><span className="dot" /><span>{t(mine ? "You are handling this chat" : "AI is handling this chat")}</span></span>
              {canDelete && <Button type="button" variant="outline" onClick={() => void setMode(mine ? "ai" : "human")}><Hand className="size-4" /><span>{t(mine ? "Hand back to AI" : "Take over")}</span></Button>}
              {canDelete && deletable.has(current.id) && <Button variant="ghost" type="button" className="icon-del" aria-label={t("Delete this chat")} onClick={() => setAsk([current.id])}><Trash2 className="size-[17px]" /></Button>}
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
            <div className="cmp-note">{t(mine ? "You are handling this chat" : "AI is handling this chat")}</div>
            <div className="cmp-row">
              <label className="sr-only" htmlFor="ibx-reply">{t("Reply personally")}</label>
              <textarea id="ibx-reply" disabled={!mine} rows={1} maxLength={2000} value={text} placeholder={`${t("Reply personally")}…`} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
              <Button type="submit" disabled={!mine || !text.trim()} aria-label={t("Send")}><Send className="size-[17px]" /><span>{t("Send")}</span></Button>
            </div>
          </form>
        </> : (
          <div className="c-empty"><span className="orb"><InboxIcon aria-hidden="true" /></span><b className="ibx-serif">{t("No chat selected")}</b><p>{t("Pick a conversation on the left. Your AI agent keeps answering in the meantime.")}</p></div>
        )}
      </section>
      <Dialog open={ask !== null} onOpenChange={(o) => { if (!o) setAsk(null); }}>
        <DialogContent className="w-[min(420px,calc(100vw-24px))] rounded-3xl border-[rgba(246,239,226,.16)] bg-[linear-gradient(180deg,#141a2e,#0c1120)] p-7 text-center sm:text-center">
          <span className="mx-auto grid h-[54px] w-[54px] place-items-center rounded-full border border-[rgba(226,87,76,.35)] bg-[rgba(226,87,76,.12)] text-[#ff8a7a]"><Trash2 className="size-6" /></span>
          <DialogTitle className="text-center font-display text-[30px] font-normal leading-none tracking-normal">{(ask?.length ?? 0) > 1 ? `${t("Delete")} ${ask?.length} ${t("chats")}?` : t("Delete this chat?")}</DialogTitle>
          <DialogDescription className="text-center text-[13.5px]">{t("The conversation is removed from your inbox. You can undo for a few seconds. Bookings and invoices stay untouched.")}</DialogDescription>
          <div className="flex justify-center gap-2.5">
            <button type="button" autoFocus className="btn btn-line" onClick={() => setAsk(null)}>{t("Cancel")}</button>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void hide()}>{t("Delete")}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
