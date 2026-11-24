import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bot,
  CalendarCheck,
  Coins,
  FileText,
  History,
  Inbox as InboxIcon,
  Paperclip,
  Plus,
  Receipt,
  Send,
  Trash2,
  Wallet,
  X,
  BadgeCheck,
  CalendarPlus,
  Image as ImageIcon,
  Tag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { askMyAgent } from "@/lib/my-agent.functions";
import { RATE_CARD_TEMPLATE } from "@/lib/my-agent-knowledge";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AgentResponse } from "./AgentResponse";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import "./chat-fields.css";

const BUCKET = "agent-chat";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 4;
const MIME_BY_EXT: Record<string, string> = {
  csv: "text/csv",
  txt: "text/plain",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const ALLOWED = new Set(Object.values(MIME_BY_EXT));
const mimeOf = (f: File) =>
  f.type && ALLOWED.has(f.type)
    ? f.type
    : (MIME_BY_EXT[f.name.split(".").pop()?.toLowerCase() ?? ""] ?? "");

type Attached = { id: string; name: string };
type Msg = { id: string; role: "user" | "assistant"; body: string; created_at: string };

/** "+ Rate Card" does not send: it puts the format in the message box for the artist to fill in. */
const FILL_FORMAT: Array<[string, string, typeof CalendarCheck]> = [
  ["+ Rate Card", RATE_CARD_TEMPLATE, Tag],
];
const QUICK: Array<[string, string, typeof CalendarCheck]> = [
  ["How many chats came in?", "How many chats came into my inbox, and which need my reply?", InboxIcon],
  ["Quote requests", "Show my new quote requests", FileText],
  ["My bookings", "How many bookings do I have, per stage?", CalendarCheck],
  ["This week's schedule", "What is on my calendar in the next 7 days?", CalendarCheck],
  ["Add schedule", "I want to add a schedule entry to my calendar", CalendarPlus],
  ["Update Photo", "Update Photo", ImageIcon],
  ["How to get verified", "How do I get verified?", BadgeCheck],
  ["Unpaid invoices", "Summarize my unpaid invoices", Receipt],
  ["Earnings and wallet", "How much can I withdraw and what did I earn this month?", Wallet],
  ["AI credits", "How many credits are left?", Coins],
  ["Draft a reply", "Draft a reply to a new enquiry", FileText],
  ["Create Calendar event", "Help me create an event in Calendar", CalendarCheck],
  ["Show invoice", "Show an existing saved invoice here in our private chat", Receipt],
  ["Monthly report", "Show this month’s bookings report as a table and bar chart", FileText],
];
const SUGGEST = [
  "How many bookings do I have?",
  "Summarize my unpaid invoices",
  "How many credits are left?",
  "Draft a reply to a new enquiry",
];
const GO: Array<[string, string, string]> = [
  ["Bookings", "bookings", "Bookings"],
  ["Invoice", "invoices", "Invoice"],
  ["Wallet", "wallet", "Wallet"],
  ["Inbox", "inbox", "Inbox"],
  ["AI agent settings", "agent", "AI agent settings"],
];

/** Artist's private business assistant: answers only from the artist's own data (server side, 1 credit per answer). */
export function YourAgent({
  artistId,
  stageName,
  onOpen,
}: {
  artistId: string;
  stageName: string;
  onOpen: (section: string) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const ask$ = useServerFn(askMyAgent);
  const [chatId, setChatId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attached[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const chats = useQuery({
    queryKey: ["agent-chats", artistId],
    queryFn: async () =>
      (
        await supabase
          .from("agent_chats")
          .select("id, title, created_at")
          .eq("artist_id", artistId)
          .order("created_at", { ascending: false })
          .limit(40)
      ).data ?? [],
  });
  const msgs = useQuery({
    queryKey: ["agent-chat-msgs", chatId],
    enabled: !!chatId,
    queryFn: async () =>
      ((
        await supabase
          .from("agent_chat_messages")
          .select("id, role, body, created_at")
          .eq("chat_id", chatId ?? "")
          .order("created_at")
      ).data ?? []) as Msg[],
  });
  const wallet = useQuery({
    queryKey: ["agent-credits", artistId],
    queryFn: async () => {
      const { data, error } = await supabase.from("credit_wallets").select("balance,balance_fraction").eq("artist_id", artistId).maybeSingle();
      if (error) throw error;
      return Number(data?.balance ?? 0) + Number(data?.balance_fraction ?? 0);
    },
  });
  const list = useMemo(() => msgs.data ?? [], [msgs.data]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [list.length, pending, busy]);

  const attach = async (picked: FileList | File[] | null) => {
    if (!picked || !picked.length) return;
    const incoming = Array.from(picked);
    if (files.length + incoming.length > MAX_FILES) {
      toast.error(`${t("Attach up to")} ${MAX_FILES} ${t("files")}`);
      return;
    }
    setUploading(true);
    try {
      for (const f of incoming) {
        const mime = mimeOf(f);
        if (!mime) {
          toast.error(`${f.name}: ${t("file type not supported")}`);
          continue;
        }
        if (f.size > MAX_BYTES) {
          toast.error(`${f.name}: ${t("max 10 MB")}`);
          continue;
        }
        const path = `${artistId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
        const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: mime });
        if (up.error) {
          toast.error(`${f.name}: ${t("upload failed")}`);
          continue;
        }
        const row = await supabase
          .from("agent_chat_files")
          .insert({
            artist_id: artistId,
            storage_path: path,
            name: f.name.slice(0, 120),
            mime,
            bytes: f.size,
          })
          .select("id, name")
          .single();
        if (row.error || !row.data) {
          await supabase.storage.from(BUCKET).remove([path]);
          toast.error(`${f.name}: ${t("upload failed")}`);
          continue;
        }
        setFiles((cur) => [...cur, { id: row.data.id, name: row.data.name }]);
      }
    } finally {
      setUploading(false);
    }
  };

  const send = async (override?: string) => {
    const question = (override ?? text).trim();
    if (!question || busy) return;
    setBusy(true);
    setPending(question);
    setText("");
    try {
      let id = chatId;
      if (!id) {
        const created = await supabase
          .from("agent_chats")
          .insert({ artist_id: artistId, title: question.slice(0, 48) })
          .select("id")
          .single();
        if (created.error || !created.data)
          throw new Error(created.error?.message ?? t("Could not start the chat"));
        id = created.data.id;
        setChatId(id);
        qc.invalidateQueries({ queryKey: ["agent-chats", artistId] });
      }
      const res = await ask$({
        data: { chatId: id, text: question, fileIds: files.map((f) => f.id) },
      });
      if ("error" in res && res.error) toast.error(res.error);
      setFiles([]);
      qc.invalidateQueries({ queryKey: ["agent-chat-msgs", id] });
      qc.invalidateQueries({ queryKey: ["agent-credits", artistId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Something went wrong"));
      setText(question);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const removeChat = async (id: string) => {
    if (!confirm(t("Delete this chat?"))) return;
    const { error } = await supabase.from("agent_chats").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (chatId === id) setChatId(null);
    qc.invalidateQueries({ queryKey: ["agent-chats", artistId] });
  };

  const credits = wallet.data ?? 0;
  const empty = list.length === 0 && !pending;

  return (
    <div
      className="grid min-h-[560px] gap-4 lg:h-[calc(100dvh-9rem)] lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)_300px]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void attach(e.dataTransfer.files);
      }}
    >
      <aside
        className={`${showHist ? "flex" : "hidden"} min-h-0 flex-col overflow-hidden rounded-[22px] border border-border bg-[linear-gradient(180deg,#0f1426,#0a0e1b)] lg:flex`}
        aria-label={t("Chat history")}
      >
        <div className="border-b border-border p-4">
          <Button
            className="w-full rounded-full bg-gradient-gold font-bold text-gold-foreground hover:opacity-90"
            onClick={() => {
              setChatId(null);
              setFiles([]);
              setShowHist(false);
            }}
          >
            <Plus className="me-1.5 h-4 w-4" />
            {t("New chat")}
          </Button>
        </div>
        <div className="px-5 pb-1 pt-4 text-[10.5px] font-bold uppercase tracking-[.14em] text-muted-foreground/70">
          {t("Recent")}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {(chats.data ?? []).length === 0 && (
            <li className="px-3 py-4 text-xs text-muted-foreground">
              {t("No earlier chats yet. Your conversations appear here.")}
            </li>
          )}
          {(chats.data ?? []).map((c) => (
            <li key={c.id} className="group flex items-center">
              <button
                type="button"
                aria-current={chatId === c.id ? "true" : undefined}
                onClick={() => {
                  setChatId(c.id);
                  setShowHist(false);
                }}
                className={`min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-start text-sm transition-colors ${chatId === c.id ? "bg-gold/[.13] text-foreground" : "text-muted-foreground hover:bg-foreground/[.04] hover:text-foreground"}`}
              >
                {c.title}
              </button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={t("Delete this chat?")}
                onClick={() => void removeChat(c.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </aside>

      <section
        className="relative flex min-h-0 flex-col overflow-hidden rounded-[22px] border border-border bg-[linear-gradient(180deg,#0f1426,#0a0e1b)]"
        aria-labelledby="ya-h"
      >
        <header className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="rounded-xl lg:hidden"
            aria-label={t("Chat history")}
            onClick={() => setShowHist((v) => !v)}
          >
            <History className="h-[18px] w-[18px]" />
          </Button>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-gold text-gold-foreground">
            <Bot className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="ya-h" className="font-display text-2xl leading-none">
              {t("Your")} <span className="it">{t("AI agent")}</span>
            </h2>
            <small className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <i className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
              {t("Online. Credits are charged per task.")}
            </small>
          </div>
          <span
            className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-bold text-gold"
            title={t("Final task charge uses your AI credits")}
          >
            {credits} {t("credits")}
          </span>
        </header>

        <Conversation className="min-h-0 flex-1 bg-[radial-gradient(ellipse_at_50%_0%,rgba(232,176,74,.05),transparent_60%)]" aria-label={t("Chat with your AI agent")}>
          <ConversationContent className="space-y-3 p-5">
            {empty && (
              <div className="flex gap-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-gold text-gold-foreground">
                  <Bot className="h-4 w-4" aria-hidden />
                </span>
                <p className="max-w-[80%] text-sm leading-relaxed">
                  {t("Hi")} {stageName.split(" ")[0]}!{" "}
                  {t(
                    "I am your AI agent. Ask me about your bookings, invoices, earnings or credits, or attach a file such as a rider, a price list or a contract and I will keep it with this chat.",
                  )}
                </p>
              </div>
            )}
            {list.map((m) => (
              <Message key={m.id} from={m.role} className="max-w-full">
                <MessageContent
                  className={m.role === "user" ? "rounded-[18px_18px_4px_18px] bg-[rgba(246,239,226,.09)] text-foreground" : "w-full"}
                  dir="auto"
                >
                  {m.role === "assistant" ? (
                    <AgentResponse body={m.body} onOpen={onOpen} />
                  ) : (
                    m.body
                  )}
                </MessageContent>
              </Message>
            ))}
            {pending && (
              <Message from="user">
                <MessageContent className="rounded-[18px_18px_4px_18px] bg-[rgba(246,239,226,.09)] text-foreground">
                  {pending}
                </MessageContent>
              </Message>
            )}
            {busy && <Shimmer className="text-sm">{t("Thinking…")}</Shimmer>}
            <div ref={endRef} />
          </ConversationContent>
        </Conversation>

        {empty && (
          <div className="flex flex-wrap justify-center gap-2 px-5 pb-3">
            {SUGGEST.map((q) => (
              <button
                key={q}
                type="button"
                disabled={busy}
                onClick={() => void send(q)}
                className="rounded-full border border-border px-3.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-gold/50 hover:text-foreground"
              >
                {t(q)}
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-border p-3">
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5" aria-label={t("Attached files")}>
              {files.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-border bg-foreground/[.05] px-2.5 py-1 text-xs"
                >
                  <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    aria-label={`${t("Remove")} ${f.name}`}
                    onClick={() => setFiles(files.filter((x) => x.id !== f.id))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <PromptInput onSubmit={() => send()} className="ya-composer">
            <PromptInputTextarea
              rows={1}
              maxLength={4000}
              value={text}
              aria-label={t("Message to your AI agent")}
              placeholder={t("Message your AI agent")}
              onChange={(e) => setText(e.target.value)}
              className="max-h-32 min-h-12 bg-transparent"
            />
            <PromptInputFooter className="justify-between">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("Attach files")}
                disabled={uploading || busy}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip className="h-[18px] w-[18px]" />
              </Button>
              <PromptInputSubmit
                status={busy ? "submitted" : "ready"}
                aria-label={t("Send message")}
                disabled={busy || uploading || !text.trim()}
              />
            </PromptInputFooter>
          </PromptInput>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="sr-only"
            accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx"
            onChange={(e) => {
              void attach(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="mt-2 px-1 text-[11px] text-muted-foreground">
            {t(
              "Enter to send, Shift+Enter for a new line. Drag files anywhere here to attach them. Your agent can make mistakes, so check important answers.",
            )}
          </p>
        </div>
      </section>

      <aside
        className="hidden min-h-0 overflow-y-auto rounded-[22px] border border-border bg-[linear-gradient(180deg,#0f1426,#0a0e1b)] p-5 xl:block"
        aria-label={t("Quick actions")}
      >
        <div className="border-b border-dashed border-border pb-5">
          <h3 className="font-display text-2xl">
            {t("Quick")} <span className="it">{t("actions")}</span>
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            {t("One click and your agent answers.")}
          </p>
          <div className="space-y-1.5">
            {FILL_FORMAT.map(([label, format, Icon]) => (
              <button
                key={label}
                type="button"
                disabled={busy}
                onClick={() => { setText(format); window.setTimeout(() => document.querySelector<HTMLTextAreaElement>(".ya-composer textarea")?.focus(), 0); }}
                className="flex w-full items-center gap-3 rounded-xl border border-gold/40 bg-gold/[.06] px-3 py-2 text-start text-sm font-semibold transition-colors hover:border-gold hover:bg-gold/10"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold/15 text-gold"><Icon className="h-3.5 w-3.5" aria-hidden /></span>
                {t(label)}
              </button>
            ))}
            {QUICK.map(([label, q, Icon]) => (
              <button
                key={label}
                type="button"
                disabled={busy}
                onClick={() => void send(q)}
                className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-start text-sm transition-colors hover:border-gold/50 hover:bg-gold/10"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold/15 text-gold">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                {t(label)}
              </button>
            ))}
          </div>
        </div>
        <div className="border-b border-dashed border-border py-5">
          <h3 className="font-display text-2xl">
            {t("Go")} <span className="it">{t("to")}</span>
          </h3>
          <div className="mt-3 space-y-1.5">
            {GO.map(([label, section]) => (
              <button
                key={section}
                type="button"
                onClick={() => onOpen(section)}
                className="w-full rounded-xl border border-border px-3 py-2 text-start text-sm transition-colors hover:border-gold/50 hover:bg-gold/10"
              >
                {t(label)}
              </button>
            ))}
          </div>
        </div>
        <div className="pt-5">
          <h3 className="font-display text-2xl">
            {t("Attach a")} <span className="it">{t("file")}</span>
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("Rider, price list, contract or photo. Up to 10 MB, 4 files at once.")}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full rounded-full"
            disabled={uploading || busy}
            onClick={() => fileInput.current?.click()}
          >
            {t("Choose files")}
          </Button>
        </div>
      </aside>
    </div>
  );
}
