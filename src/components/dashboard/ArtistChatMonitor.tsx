import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Bot, Hand, Lock, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { readArtistChat, changeArtistChatMode } from "@/lib/artist-chat.functions";
import { artistReply } from "@/lib/chat.functions";
import { decodeChatMessage } from "@/lib/chat-attachments";
import { artistChatFiles } from "@/lib/chat-files.functions";
import { ChatAttachments } from "@/components/chat/ChatAttachments";
import { ChatShell, type ChatSetting } from "@/components/chat/shell/ChatShell";
import { ChatSettingsPage, LanguageChoice } from "@/components/chat/shell/ChatSettingsPage";
import { chatInvoices } from "@/components/chat/shell/billing-split";
import { decodeInvoice } from "@/lib/invoice";
import { InvoiceBlock } from "@/components/chat/shell/InvoiceSheet";
import { paperForInvoice, savedInvoice } from "@/lib/chat-invoice";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { LogoutButton } from "@/components/shared/LogoutButton";

/** The artist's view of a booking chat: read only while the AI handles it, unlocked by Take Over. */
export function ArtistChatMonitor({ id }: { id: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const read$ = useServerFn(readArtistChat);
  const mode$ = useServerFn(changeArtistChatMode);
  const reply$ = useServerFn(artistReply);
  const files$ = useServerFn(artistChatFiles);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<ChatSetting | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const query = useQuery({ queryKey: ["artist-chat-monitor", id], queryFn: () => read$({ data: { id } }), refetchInterval: 4000, retry: false });
  const files = useQuery({ queryKey: ["artist-monitor-files", id, query.data?.messages.length], queryFn: () => files$({ data: { id } }), enabled: !!query.data, staleTime: 240000 });
  const artistId = query.data?.chat.artist_id;
  const chats = useQuery({
    queryKey: ["artist-chat-list", artistId], enabled: !!artistId, refetchInterval: 30000,
    queryFn: async () => (await supabase.from("conversations").select("id,client_name").eq("artist_id", artistId!).is("deleted_at", null).order("last_message_at", { ascending: false }).limit(40)).data ?? [],
  });
  const billing = useQuery({
    queryKey: ["artist-chat-billing", id], enabled: !!artistId, refetchInterval: 15000,
    queryFn: async () => {
      const [bookings, invoices] = await Promise.all([
        supabase.from("bookings").select("id,package_title,event_date,total,status,start_time,end_time,guests,job_detail,notes,paid_at,paid_amount,amount,vat_amount,invoice_no,invoice_items,created_at,client_name,client_email").eq("conversation_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("service_invoices").select("id,status,total,paid_at,created_at,booking_id,document").eq("conversation_id", id),
      ]);
      return { bookings: bookings.data ?? [], invoices: invoices.data ?? [] };
    },
  });
  const profile = useQuery({
    queryKey: ["artist-chat-profile", artistId], enabled: !!artistId,
    queryFn: async () => (await supabase.from("artists").select("stage_name,trn").eq("id", artistId!).maybeSingle()).data,
  });
  const canReply = query.data?.chat.mode === "human" && !!query.data.chat.chat_operator_id;
  useEffect(() => { document.documentElement.classList.add("dm-dash"); return () => document.documentElement.classList.remove("dm-dash"); }, []);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [query.data?.messages.length, files.data]);
  useEffect(() => { if (canReply) input.current?.focus(); }, [canReply]);
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
  const client = query.data?.chat.client_name ?? query.data?.chat.quote_requests?.name ?? t("Booking chat");
  const status = canReply ? "You are handling this chat" : query.data?.chat.handover_requested_at ? "Waiting for artist takeover" : "AI is handling this chat";
  const parties = { artistName: profile.data?.stage_name ?? "", trn: profile.data?.trn, client: query.data?.chat.client_name ?? query.data?.chat.quote_requests?.name };
  const invoices = (billing.data?.invoices ?? []).map((row) => savedInvoice(row, billing.data?.bookings.find((b) => b.id === row.booking_id), { client: parties.client }));
  return (
    <ChatShell
      brand={<Link to="/dashboard"><i aria-hidden="true">D</i>Dealmaker Studio</Link>}
      top={<Button asChild className="dmc-primary"><Link to="/dashboard"><ArrowLeft className="me-1 h-4 w-4" />{t("Back to dashboard")}</Link></Button>}
      recent={(chats.data ?? []).map((chat) => ({
        id: chat.id, title: chat.client_name ?? t("Client"), active: chat.id === id,
        onOpen: () => { if (chat.id !== id) void navigate({ to: "/dashboard/chat/$id", params: { id: chat.id } }); },
      }))}
      page={page}
      onPage={setPage}
      hidden={["commission"]}
      settings={(current) => (
        <ChatSettingsPage
          page={current}
          bookings={(billing.data?.bookings ?? []).map((b) => ({ id: b.id, title: b.package_title ?? t("Booking"), date: b.event_date, total: Number(b.total ?? 0), status: b.status, start: b.start_time, end: b.end_time, guests: b.guests, detail: b.job_detail, notes: b.notes, paidAt: b.paid_at, paidAmount: Number(b.paid_amount ?? 0), amount: Number(b.amount ?? 0), vat: Number(b.vat_amount ?? 0), number: b.invoice_no, items: b.invoice_items, createdAt: b.created_at, client: b.client_name, clientEmail: b.client_email }))}
          invoices={chatInvoices(query.data?.messages ?? [], invoices)}
          parties={parties}
          account={<ArtistAccount />}
          paymentNote="The client pays through Dealmaker. Your share reaches your wallet after the job is completed."
        />
      )}
    >
      {(sidebarButton) => <>
        <header className="dmc-hd">
          {sidebarButton}
          <span className="dmc-av" aria-hidden="true"><Bot className="h-5 w-5" /></span>
          <div className="dmc-title"><h1 className="font-display">{client}</h1><small><i aria-hidden="true" />{t(status)}</small></div>
          {canReply && <Button type="button" variant="outline" className="dmc-aiback" disabled={busy} onClick={() => void mode("ai")}><Bot className="me-1.5 h-4 w-4" />{t("AI Take Over")}</Button>}
        </header>
        <div ref={log} className="dmc-body" role="log" aria-live="polite" aria-label={t("Conversation")}>
          <div className="dmc-col">
            {query.isPending && <p className="dmc-hint">{t("Loading…")}</p>}
            {query.error && <p role="alert" className="dmc-hint">{query.error.message}</p>}
            {query.data?.messages.map((message) => {
              const invoice = decodeInvoice(message.body);
              if (message.sender === "system") return <p key={message.id} className="dmc-hint">{message.body}</p>;
              const ours = message.sender !== "client";
              return (
                <article key={message.id} className={`dmc-msg ${ours ? "me" : "them"}`}>
                  <div className={`flex min-w-0 max-w-full flex-col ${invoice ? "w-full" : ""}`} style={{ alignItems: ours ? "flex-end" : "flex-start" }}>
                    <span className="dmc-who">{t(message.sender === "artist" ? "You" : message.sender === "ai" ? "AI Agent" : "Client")}</span>
                    {invoice ? <InvoiceBlock paper={paperForInvoice(invoice, invoices.find((row) => row.id === invoice.id), parties)} /> : <p className="tx" dir="auto">{decodeChatMessage(message.body).text}</p>}
                    <ChatAttachments files={files.data?.find((file) => file.id === message.id)?.files ?? []} />
                    <time className="dmc-time">{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        <div className="dmc-foot">
          <div className={`dmc-lockbox ${canReply ? "" : "is-locked"}`}>
            <form className="dmc-write" onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <textarea ref={input} rows={1} aria-label={t("Message")} placeholder={t("Type your message…")} disabled={!canReply || busy} value={text} maxLength={2000}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
              <Button type="submit" size="icon" className="dmc-send" disabled={!canReply || busy || !text.trim()} aria-label={t("Send message")}><Send className="h-4 w-4" /></Button>
            </form>
            {!canReply && query.data && (
              <div className="dmc-lock">
                <span className="inline-flex items-center gap-2"><Lock className="h-4 w-4" aria-hidden />{t(status)}</span>
                <Button type="button" className="dmc-takeover" disabled={busy} onClick={() => void mode("human")}><Hand className="me-1.5 h-4 w-4" />{t("Take Over")}</Button>
              </div>
            )}
          </div>
          <p className="dmc-note">{t("DEMO MODE · Phone numbers, emails and social handles are hidden automatically to keep you protected.")}</p>
        </div>
      </>}
    </ChatShell>
  );
}

function ArtistAccount() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <>
      <article className="dmc-card">
        <h2>{String(user?.user_metadata?.["display_name"] ?? t("Your account"))}</h2>
        <p>{user?.email}</p>
        <div className="dmc-actions">
          <Button asChild variant="outline" className="rounded-full"><Link to="/account">{t("Account settings")}</Link></Button>
          <Button asChild variant="outline" className="rounded-full"><Link to="/dashboard">{t("Back to dashboard")}</Link></Button>
          <LogoutButton />
        </div>
      </article>
      <LanguageChoice />
    </>
  );
}
