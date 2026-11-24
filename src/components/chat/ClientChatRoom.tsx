import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Send } from "lucide-react";
import { getChat, sendClientMessage } from "@/lib/chat.functions";
import { getConversationBookings } from "@/lib/bookings.functions";
import { aed } from "@/lib/format";
import { ArtistAvatar } from "@/components/site/ArtistCard";
import { Button } from "@/components/ui/button";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatAttachments } from "@/components/chat/ChatAttachments";
import { uploadChatFile } from "@/lib/chat-files.functions";
import { validateAttachment, type ChatAttachment } from "@/lib/chat-attachments";
import { useI18n } from "@/lib/i18n";
import { decodeInvoice } from "@/lib/invoice";
import { PayableInvoice } from "@/components/site/PayableInvoice";
import { extractButtons, extractForm } from "@/lib/ai-flow";
import { ChatFlowButtons, ChatFlowForm } from "@/components/flow/ChatFlowControls";
import { maskContacts } from "@/lib/masking";

/** The client side of a quote conversation (secret link key), shared by /chat and the client portal. */
export function ClientChatRoom({ id, k, embedded = false, className = "flex h-[calc(100dvh-var(--site-header-height))] flex-col bg-background" }: { id: string; k: string; embedded?: boolean; className?: string }) {
  const qc = useQueryClient();
  const get$ = useServerFn(getChat);
  const send$ = useServerFn(sendClientMessage);
  const upload$ = useServerFn(uploadChatFile);
  const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const addFiles = async (list: FileList) => {
    if (files.length + list.length > 3) { toast.error(tr("Maximum three attachments per message.")); return; }
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        validateAttachment(file);
        const form = new FormData(); form.set("id", id); form.set("key", k); form.set("file", file);
        const uploaded = await upload$({ data: form });
        setFiles(current => [...current, uploaded]);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : tr("Upload failed")); }
    finally { setUploading(false); }
  };
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ body: string; previousIds: string[] } | null>(null);
  const { t: tr } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const { data, error, refetch } = useQuery({
    queryKey: ["chat", id],
    queryFn: () => get$({ data: { id, key: k } }),
    refetchInterval: 5000,
  });
  const offers$ = useServerFn(getConversationBookings);
  const { data: offers } = useQuery({ queryKey: ["chat-offers", id], queryFn: () => offers$({ data: { id, key: k } }), refetchInterval: 10000, enabled: !!k });
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [data?.messages.length, busy, pending]);
  const pendingVisible = pending && !data?.messages.some(m => m.sender === "client" && m.body === pending.body && !pending.previousIds.includes(m.id));

  const send = async (preset?: string) => {
    const t = (preset ?? text).trim();
    if ((!t && !files.length) || busy || uploading) return;
    setBusy(true);
    setPending({ body: maskContacts(t), previousIds: data?.messages.map(m => m.id) ?? [] });
    setText("");
    try {
      const r = await send$({ data: { id, key: k, text: t, attachments: preset ? [] : files } });
      if ("error" in r && r.error) { toast.error(r.error); setText(t); }
      if (!("error" in r)) setFiles([]);
      await qc.invalidateQueries({ queryKey: ["chat", id] });
    } catch { toast.error(tr("Message failed. Please try again.")); setText(t); }
    finally { setPending(null); setBusy(false); }
  };

  if (error && !data) return <div className={className}><div role="alert" className="m-auto space-y-4 p-10 text-center"><p>{tr("This conversation could not load. Check your connection and try again.")}</p><Button onClick={() => { void refetch(); }}>{tr("Try again")}</Button></div></div>;
  const a = data?.artist;
  return (
    <div className={className}>
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          {a && <ArtistAvatar name={a.stage_name} hue={a.hue ?? 30} src={a.profilePhotoUrl} className="h-10 w-10 rounded-full text-sm" />}
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
          {!embedded && <div className="text-center text-xs text-muted-foreground">{tr("Save this page's link to come back to your conversation.")}</div>}
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
            decodeInvoice(m.body) ? (
              <div key={m.id} className="max-w-md"><PayableInvoice inv={decodeInvoice(m.body) as NonNullable<ReturnType<typeof decodeInvoice>>} conversationId={id} linkKey={k} status={data.invoices.find(i => i.id === decodeInvoice(m.body)?.id)?.status} /></div>
            ) : m.sender === "system" ? (
              <div key={m.id} className="text-center text-xs text-muted-foreground">{m.body}</div>
            ) : m.sender === "client" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-primary px-4 py-2.5 text-sm text-primary-foreground" dir="auto">{m.body}<ChatAttachments files={m.attachments} /></div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-gold text-gold-foreground">
                  {m.sender === "ai" ? <Bot className="h-4 w-4" /> : <span className="text-xs font-bold">{a?.stage_name?.[0]}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">{m.sender === "ai" ? tr("AI assistant") : a?.stage_name}</div>
                  {decodeInvoice(m.body) ? <div className="max-w-md"><PayableInvoice inv={decodeInvoice(m.body) as NonNullable<ReturnType<typeof decodeInvoice>>} conversationId={id} linkKey={k} status={data.invoices.find(i => i.id === decodeInvoice(m.body)?.id)?.status} /></div> : (() => { const f = extractForm(m.body); const { text: body, buttons } = extractButtons(f.text); const last = m.id === data.messages[data.messages.length - 1]?.id; return <>
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed" dir="auto">{body}</div>
                    {buttons.length > 0 && last && data.mode !== "human" && (
                      <ChatFlowButtons buttons={buttons} busy={busy} onSelect={(value) => send(value)} />
                    )}
                    {f.fields.length > 0 && last && data.mode !== "human" && <ChatFlowForm fields={f.fields} busy={busy} onSubmit={(t) => send(t)} />}
                  </>; })()}
                </div>
              </div>
            ),
          )}
          {pendingVisible && pending && (
            <div className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-primary px-4 py-2.5 text-sm text-primary-foreground" dir="auto">{pending.body}</div>
            </div>
          )}
          {busy && (
            <div className="flex gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-gold text-gold-foreground"><Bot className="h-4 w-4" /></div>
              <div role="status" className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
                <span>{tr("AI assistant")} · {tr("Typing…")}</span>
                <span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map((n) => <span key={n} className="h-2 w-2 animate-bounce motion-reduce:animate-none rounded-full bg-muted-foreground" style={{ animationDelay: `${n * 0.15}s` }} />)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="bg-background px-4 pb-4 pt-2">
        <div className="mx-auto max-w-3xl">
          <ChatComposer text={text} onChange={setText} onSend={() => void send()} busy={busy || uploading} files={files} onFiles={list => void addFiles(list)} onRemove={path => setFiles(current => current.filter(file => file.path !== path))} />
          <p className="mt-2 text-center text-[11px] text-muted-foreground">{tr("DEMO MODE · Phone numbers, emails and social handles are hidden automatically to keep you protected.")}</p>
        </div>
      </div>
    </div>
  );
}

