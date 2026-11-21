import { decodeChatMessage } from "@/lib/chat-attachments";
import { ChatAttachments } from "@/components/chat/ChatAttachments";
import { artistChatFiles } from "@/lib/chat-files.functions";
import { decodeInvoice } from "@/lib/invoice";
import { InvoiceCard } from "@/components/site/InvoiceCard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Bot, Coins, Search, Send, Inbox as InboxIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { artistReply, testAgent } from "@/lib/chat.functions";
import { BillingPanel } from './BillingPanel';
import { artistCheckout } from "@/lib/payments.functions";
import { SandboxCheckout, PaymentTestModeBanner, type CheckoutSession } from "@/components/site/SandboxCheckout";
import { TOPUP_PACKAGES } from "@/lib/masking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { StudioHeading, StudioSection, StudioSoon, StudioEmpty } from "./StudioPage";
import { initials } from "@/lib/format";

export function Inbox({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const qc = useQueryClient();
  const reply$ = useServerFn(artistReply);
  const files$ = useServerFn(artistChatFiles);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const { data: convos } = useQuery({
    queryKey: ["inbox", artistId],
    queryFn: async () => {
      const { data, error } = await supabase.from("conversations").select("id, mode, ai_replies, last_message_at, quote_requests(name, event_date)").eq("artist_id", artistId).order("last_message_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10000,
  });
  const convoIds = (convos ?? []).map((c) => c.id);
  const { data: lastMsgs } = useQuery({
    queryKey: ["inbox-last", artistId, convoIds.join(",")],
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
  useEffect(() => {
    if (!open && convos && convos.length > 0) setOpen(convos[0]!.id);
  }, [convos, open]);
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
  const current = convos?.find((c) => c.id === open);
  const setMode = async (mode: string) => {
    if (!open) return;
    const { error } = await supabase.from("conversations").update({ mode }).eq("id", open);
    if (error) { toast.error(t("Could not change chat mode")); return; }
    qc.invalidateQueries({ queryKey: ["inbox", artistId] });
  };
  const send = async () => {
    if (!text.trim() || !open) return;
    try {
      await reply$({ data: { id: open, text } });
      setText("");
      if (current?.mode === "ai") await setMode("human");
      qc.invalidateQueries({ queryKey: ["inbox-msgs", open] });
    } catch { toast.error(t("Reply failed")); }
  };
  return (
    <div className="dmr-ibx">
      <section className="dmr-list" aria-label={t("Conversations")}>
        <div className="dmr-l-head">
          <div className="dmr-l-title"><h2 className="dmr-serif">{t("Inbox")}</h2><span className="dmr-l-n">{convos?.length ?? 0} {t("chats")}</span><Button variant="ghost" disabled title={t("segera")} className="ms-auto">{t("Select")} · {t("segera")}</Button></div>
          <div className="relative"><Search className="absolute start-3 top-3 size-4 text-gold" /><Input className="ps-10" aria-label={t("Search chats")} placeholder={t("Search chats")} value={search} onChange={e => setSearch(e.target.value)} /></div>
          <div className="dmr-q-tabs" role="group" aria-label={t("Filter chats")}>{[["all","All"],["ai","AI handling"],["human","You"]].map(([value,label])=><Button key={value} size="sm" variant={filter === value ? "default" : "ghost"} aria-pressed={filter === value} onClick={()=>setFilter(value ?? "all")}>{t(label ?? "")}</Button>)}</div>
          <div className="studio-soon">{t("Labels")} · {t("segera")}</div>
        </div>
        <div className="dmr-threads">
          {convos?.length === 0 && <StudioEmpty title={t("No conversations yet.")} icon={InboxIcon} />}
          {convos?.filter(c => (filter === "all" || c.mode === filter) && `${c.quote_requests?.name ?? "Direct chat"} ${c.id}`.toLowerCase().includes(search.toLowerCase())).map(c => <Button variant="ghost" key={c.id} onClick={()=>setOpen(c.id)} className={`studio-thread ${open === c.id ? "is-selected" : ""}`}><span className="studio-thread-avatar">{initials(c.quote_requests?.name ?? t("Client"))}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><b className="truncate text-sm">{c.quote_requests?.name ?? `${t("Direct chat")} · ${c.id.slice(0,8)}`}</b><Badge>{t(c.mode === "human" ? "Needs you" : "AI")}</Badge></span><span className="mt-1 block truncate text-xs text-muted-foreground">{lastMsgs?.get(c.id) ? `${lastMsgs.get(c.id)!.sender === "ai" ? "AI: " : lastMsgs.get(c.id)!.sender === "artist" ? `${t("You")}: ` : ""}${decodeChatMessage(lastMsgs.get(c.id)!.body).text}` : `${c.quote_requests?.event_date ?? t("date TBC")} · ${c.ai_replies} ${t("AI replies")}`}</span><span className="block text-[11px] text-muted-foreground/70">{c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : ""} · {c.quote_requests?.event_date ?? t("date TBC")} · {c.ai_replies} {t("AI replies")}</span></span></Button>)}
        </div>
      </section>
      <section className="dmr-conv" aria-label={t("Conversation")}>
        {open ? <>
          <header className="dmr-c-head"><div className="dmr-c-who"><span className="studio-thread-avatar">{initials(current?.quote_requests?.name ?? t("Client"))}</span><div><b>{current?.quote_requests?.name ?? t("Direct chat")}</b><small>{current?.quote_requests?.event_date ?? t("Event date TBC")}</small></div></div><div className="dmr-c-act"><span className="text-xs text-muted-foreground">{t(current?.mode === "human" ? "You're handling this chat" : "AI is handling this chat")}</span><Button size="sm" variant="outline" onClick={()=>setMode(current?.mode === "human" ? "ai" : "human")}>{t(current?.mode === "human" ? "Hand back to AI" : "Take over")}</Button><Button size="icon" variant="ghost" aria-label={t("Back to chats")} onClick={()=>setOpen(null)}><ArrowLeft className="size-4 rtl:rotate-180" /></Button></div></header>
          <div className="dmr-msgs space-y-3" aria-live="polite">{msgs?.map(m => { const inv = decodeInvoice(m.body); return m.sender === "system" && !inv ? <div key={m.id} className="text-center text-xs text-muted-foreground">{m.body}</div> : <div key={m.id} className={`flex ${m.sender === "client" ? "justify-start" : "justify-end"}`}><div className={`dmr-m ${m.sender === "client" ? "studio-message-client" : m.sender === "ai" ? "studio-message-ai" : "studio-message-artist"}`} dir="auto"><div className="mb-1 text-[10px] uppercase opacity-70">{t(m.sender === "ai" ? "AI assistant" : m.sender === "artist" ? "You" : "Client")}</div>{inv ? <InvoiceCard inv={inv} /> : <>{decodeChatMessage(m.body).text}<ChatAttachments files={attachments?.find(item => item.id === m.id)?.files ?? []} /></>}</div></div>; })}</div>
          <div className="dmr-composer"><div className="dmr-cmp-note">{t("Replying here takes the chat over from your AI agent.")}</div><div className="dmr-cmp-row"><Input value={text} onChange={e=>setText(e.target.value)} placeholder={t("Reply personally…")} maxLength={2000} onKeyDown={e=>e.key === "Enter" && send()} /><Button onClick={send} aria-label={t("Send")}><Send className="size-4" /></Button></div></div>
        </> : <div className="dmr-c-empty"><StudioEmpty title={t("No chat selected")} icon={InboxIcon} /></div>}
      </section>
    </div>
  );
}

export function AgentSettings({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const test$ = useServerFn(testAgent);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["agent", artistId], queryFn: async () => (await supabase.from("agent_settings").select("*").eq("artist_id", artistId).maybeSingle()).data });
  const [v, setV] = useState({ enabled: true, tone: "warm and professional", max_discount_pct: 10, extra_instructions: "", knowledge: "" });
  useEffect(() => { if (data) setV({ enabled: data.enabled, tone: data.tone, max_discount_pct: data.max_discount_pct, extra_instructions: data.extra_instructions ?? "", knowledge: data.knowledge ?? "" }); }, [data]);
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState<{ id: string; sender: string; body: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const { error } = await supabase.from("agent_settings").upsert({ artist_id: artistId, ...v, extra_instructions: v.extra_instructions || null, knowledge: v.knowledge || null, updated_at: new Date().toISOString() });
    if (error) { toast.error(error.message); return; }
    toast.success(t("AI agent settings saved"));
  };
  const test = async () => {
    if (!msg.trim()) return;
    setBusy(true);
    try { const r = await test$({ data: { text: msg } }); setChat(r.messages); setMsg(""); qc.invalidateQueries({ queryKey: ["wallet", artistId] }); }
    catch { toast.error(t("Test failed")); } finally { setBusy(false); }
  };
  return (
    <div className="dmr-wrap dmr-agpage">
      <StudioHeading title="AI" accent="agent"><label className="flex items-center gap-3"><Switch checked={v.enabled} onCheckedChange={c=>setV({...v,enabled:c})} />{t(v.enabled ? "Agent is on" : "Agent is off")}</label></StudioHeading>
      <section className="dmr-panel studio-agent-settings">
        <StudioSoon label="Model" />
        <div className="dmr-qe-f"><Label>{t("Tone of voice")}</Label><Input value={v.tone} maxLength={80} onChange={e=>setV({...v,tone:e.target.value})} /></div>
        <div className="grid grid-cols-2 gap-3"><StudioSoon label="Reply length" /><StudioSoon label="Languages it replies in" /></div>
        <div className="dmr-qe-f"><Label>{t("Maximum discount the AI may offer (%)")}</Label><Input type="number" min={0} max={30} value={v.max_discount_pct} onChange={e=>setV({...v,max_discount_pct:Math.min(30,Math.max(0,Number(e.target.value)))})} /></div>
        <StudioSoon label="Hand over to me" />
        <div className="studio-save-bar"><span className="text-xs text-muted-foreground">{t("AI replies on")}</span><Button onClick={save}>{t("Save settings")}</Button></div>
      </section>
      <section className="dmr-panel studio-agent-test">
        <header className="studio-agent-header"><span className="studio-empty-icon"><Bot /></span><div><h2>{t("Test your")} <span className="it">{t("assistant")}</span></h2><p className="text-xs text-muted-foreground">{t("Each reply uses 1 credit, like a real chat.")}</p></div></header>
        <div className="studio-agent-chat space-y-3" role="log" aria-live="polite">{chat.map(m=>m.sender === "system" ? <div key={m.id} className="text-center text-xs text-muted-foreground">{m.body}</div> : <div key={m.id} className={`flex ${m.sender === "client" ? "justify-end" : ""}`}><div className={`dmr-m ${m.sender === "client" ? "studio-message-client" : "studio-message-ai"}`} dir="auto">{m.body}</div></div>)}{busy && <p className="text-xs text-muted-foreground">{t("Thinking…")}</p>}</div>
        <div className="flex gap-2"><Input value={msg} onChange={e=>setMsg(e.target.value)} placeholder={t("Pretend to be a client…")} onKeyDown={e=>e.key === "Enter" && test()} /><Button onClick={test} disabled={busy} aria-label={t("Send test message")}><Send className="size-4" /></Button></div>
      </section>
      <StudioSection title="Agent" accent="prompts" className="dmr-c-12"><StudioSoon label="Prompt library" /></StudioSection>
      <section className="dmr-panel dmr-c-12"><h2>{t("Your")} <span className="it">{t("rules and facts")}</span></h2><div className="grid gap-6 md:grid-cols-2 mt-5"><div className="dmr-qe-f"><Label>{t("Reply instructions")}</Label><Textarea rows={6} maxLength={1500} value={v.extra_instructions} onChange={e=>setV({...v,extra_instructions:e.target.value})} placeholder={t("e.g. I need a 30-min sound check. No performances after 1am.")} /></div><div className="dmr-qe-f"><Label>{t("AI knowledge")}</Label><Textarea rows={8} maxLength={8000} value={v.knowledge} onChange={e=>setV({...v,knowledge:e.target.value})} placeholder={t("Facts the assistant can use: FAQ, equipment, set list, travel, rider, cancellation terms.")} /><div className="text-end text-xs text-muted-foreground">{v.knowledge.length}/8000</div></div></div><Button onClick={save}>{t("Save settings")}</Button></section>
    </div>
  );
}

export function Credits({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const top$ = useServerFn(artistCheckout);
  const [checkout, setCheckout] = useState<CheckoutSession | null>(null);
  const { data } = useQuery({
    queryKey: ["wallet", artistId],
    queryFn: async () => {
      const [w, l] = await Promise.all([
        supabase.from("credit_wallets").select("balance").eq("artist_id", artistId).maybeSingle(),
        supabase.from("credit_ledger").select("*").eq("artist_id", artistId).order("created_at", { ascending: false }).limit(30),
      ]);
      return { balance: w.data?.balance ?? 0, ledger: l.data ?? [] };
    },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const buy = async (id: string) => {
    setBusy(id);
    try { const r = await top$({ data: { kind: "credits", packageId: id } }); if ("error" in r) throw new Error(r.error); setCheckout(r); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Top-up failed"); } finally { setBusy(null); }
  };
  const labels: Record<string, string> = { plan_allocation: "Plan credits", ai_reply: "AI reply", topup_demo: "Top-up (demo)", topup_stripe_sandbox: "Stripe sandbox top-up" };
  return (
    <div className="dmr-wrap dmr-cpage">
      <StudioHeading title="AI" accent="credits" />
      <div className="dmr-c-12"><PaymentTestModeBanner />{checkout && <SandboxCheckout session={checkout} onPaid={()=>{setCheckout(null);toast.success(t("Payment verified — credits added"));qc.invalidateQueries({queryKey:["wallet",artistId]});}} />}</div>
      <section className="dmr-panel studio-credit-hero"><div><p className="text-xs uppercase text-muted-foreground">{t("AI credit balance")}</p><div className="font-display text-6xl mt-3">{data?.balance ?? "—"}</div><p className="text-xs text-muted-foreground mt-4">{t("1 credit = 1 AI reply. Clients never pay for AI.")}</p><Button asChild className="mt-6"><a href="#studio-credit-packs"><Coins className="size-4" />{t("Buy credits")}</a></Button></div><div className="studio-credit-chart"><h2>{t("Usage")} <span className="it">{t("per day")}</span></h2><div className="studio-credit-bars">{Array.from({length:7},(_,i)=>{const date=new Date();date.setDate(date.getDate()-6+i);const key=date.toISOString().slice(0,10);const usage=(data?.ledger ?? []).filter(l=>l.created_at.slice(0,10) === key && l.delta < 0).reduce((sum,l)=>sum-l.delta,0);return <div key={key}><span>{usage}</span><i style={{height:Math.min(100,usage*5)+"%"}} /><span>{date.toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</span></div>;})}</div><p className="text-xs text-muted-foreground mt-3">{t("Latest 30 credit entries")}</p></div></section>
      {data && data.balance < 20 && <div className="dmr-c-12 dmr-w-banner">{t("Your credits are running low. When they run out, new chats wait for your personal reply.")}</div>}
      <div className="dmr-w-left">
        <StudioSection title="Usage by" accent="model"><div className="grid grid-cols-2 gap-3"><StudioSoon label="Model" /><StudioSoon label="Input / output tokens" /><StudioSoon label="Cost" /><StudioSoon label="Share" /></div></StudioSection>
        <section className="dmr-panel dmr-q-panel"><div className="dmr-q-tools"><h2>{t("Usage")} <span className="it">{t("history")}</span></h2></div><div className="dmr-tbl-wrap"><table><thead><tr>{["Date and time","Activity","Credits"].map(h=><th key={h}>{t(h)}</th>)}</tr></thead><tbody>{data?.ledger.map(l=><tr key={l.id}><td>{new Date(l.created_at).toLocaleString("en-GB")}</td><td>{t(labels[l.reason] ?? l.reason)}</td><td className={l.delta < 0 ? "text-destructive" : "text-success"}>{l.delta > 0 ? "+" : ""}{l.delta}</td></tr>)}</tbody></table></div>{data?.ledger.length === 0 && <StudioEmpty title={t("No usage found")} />}</section>
        <StudioSection title="Your" accent="plan"><BillingPanel artistId={artistId} /></StudioSection>
        <StudioSection title="Top up" accent="credits"><div id="studio-credit-packs" className="studio-credit-packs">{TOPUP_PACKAGES.map(p=><div key={p.id} className="studio-credit-pack"><div className="font-display">{p.credits}</div><span className="text-xs text-muted-foreground">{t("credits")}</span><p className="mt-3 text-sm font-semibold">{t("AED")} {(p.priceAed * 1.05).toFixed(2)}</p><p className="text-xs text-muted-foreground">{t("incl. VAT 5%")}</p><Button disabled={busy !== null} onClick={()=>buy(p.id)}>{t(busy === p.id ? "Processing…" : "Buy · Stripe sandbox")}</Button></div>)}</div></StudioSection>
      </div>
      <div className="dmr-w-side"><StudioSection title="Token" accent="rates"><StudioSoon label="Provider rates" /></StudioSection><StudioSection title="How credits" accent="work"><div className="space-y-4 text-sm text-muted-foreground"><p>{t("1 credit = 1 AI reply. Clients never pay for AI.")}</p><p>{t("When credits run out, new chats wait for your personal reply.")}</p></div></StudioSection></div>
    </div>
  );
}

