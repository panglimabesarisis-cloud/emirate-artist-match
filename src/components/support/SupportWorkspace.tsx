import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LifeBuoy, Plus, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StudioHeading } from "@/components/dashboard/StudioPage";
import { useI18n } from "@/lib/i18n";
import "@/components/dashboard/inbox.css";
import "@/components/dashboard/chat-fields.css";
import "./support-workspace.css";
import { initials } from "@/lib/format";
const topics = ["verification", "payout", "booking", "payment", "calendar", "technical", "account"];
/** Inbox label colours reused for ticket status. */
const STATUS_TONE: Record<string, string> = { open: "partial", answered: "paid", closed: "inquiry" };
const day = (value: string) => new Date(value).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short" });
const date = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
export function SupportWorkspace({ artistId, admin = false }: { artistId?: string; admin?: boolean }) {
  const { t } = useI18n(); const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null); const [creating, setCreating] = useState(false);
  const [showThread, setShowThread] = useState(false);
  const [topic, setTopic] = useState("technical"); const [text, setText] = useState(""); const [search, setSearch] = useState(""); const [filter, setFilter] = useState("all"); const [busy, setBusy] = useState(false);
  const tickets = useQuery({ queryKey: ["support-threads", artistId ?? "admin"], refetchInterval: 5000, queryFn: async () => {
    let query = supabase.from("support_requests").select("id,reference,topic,message,status,created_at,artist_id,user_id,artists(stage_name)").order("created_at", { ascending: false }).limit(200);
    if (!admin && artistId) query = query.eq("artist_id", artistId);
    const result = await query; if (result.error) throw result.error; return result.data ?? [];
  }});
  const ticket = tickets.data?.find(row => row.id === selected) ?? (!creating ? tickets.data?.[0] : undefined);
  const messages = useQuery({ queryKey: ["support-thread-messages", ticket?.id], enabled: !!ticket && !creating, refetchInterval: 3000, queryFn: async () => {
    if (!ticket) return [];
    const result = await supabase.from("support_ticket_messages").select("id,sender_role,body,created_at").eq("ticket_id", ticket.id).order("created_at").order("id"); if (result.error) throw result.error; return result.data ?? [];
  }});
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["support-threads"] }), qc.invalidateQueries({ queryKey: ["support-thread-messages"] })]); };
  const send = async () => {
    if (busy || !text.trim() || (!creating && (!ticket || ticket.status === "closed"))) return;
    if (creating && text.trim().length < 10) { toast.error(t("Describe the issue in at least 10 characters.")); return; }
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser(); if (!auth.user) throw new Error(t("Please sign in."));
      if (creating) {
        const result = await supabase.from("support_requests").insert({ artist_id: artistId ?? null, user_id: auth.user.id, topic, message: text.trim() }).select("id").single(); if (result.error) throw result.error;
        setSelected(result.data.id); setCreating(false);
      } else if (ticket) {
        const result = await supabase.from("support_ticket_messages").insert({ ticket_id: ticket.id, sender_id: auth.user.id, sender_role: admin ? "admin" : "requester", body: text.trim() }); if (result.error) throw result.error;
      }
      setText(""); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Could not send message.")); } finally { setBusy(false); }
  };
  const changeStatus = async () => {
    if (!admin || !ticket || busy) return; setBusy(true);
    try { const result = await supabase.from("support_requests").update({ status: ticket.status === "closed" ? "open" : "closed" }).eq("id", ticket.id); if (result.error) throw result.error; await refresh(); }
    catch { toast.error(t("Could not change ticket status.")); } finally { setBusy(false); }
  };
  const rows = (tickets.data ?? []).filter(row => (filter === "all" || row.status === filter) && `${row.reference} ${row.topic} ${row.artists?.stage_name ?? ""} ${row.message}`.toLowerCase().includes(search.toLowerCase()));
  const closed = !creating && ticket?.status === "closed";
  const mine = (role: string) => (admin ? role === "admin" : role !== "admin");
  const bubble = (key: string, role: string, at: string, body: string) => <article key={key} className={`m ${mine(role) ? "you" : "client"}`}><span className="who">{t(role === "admin" ? "Dealmaker support" : "Request")}</span><div className="bub" dir="auto">{body}</div><time>{date(at)}</time></article>;
  return <div className="space-y-5"><StudioHeading title="Support" accent={admin ? "inbox" : "tickets"}>{!admin && <Button onClick={() => { setCreating(true); setText(""); }}><Plus className="size-4" />{t("New ticket")}</Button>}</StudioHeading>
    <div className={`ibx-root support-ibx${showThread || creating ? " open" : ""}`}>
      <aside className="ibx-list" aria-label={t("Tickets")}>
        <div className="l-head">
          <div className="l-title"><h2 className="ibx-serif">{t("Tickets")}</h2><span className="l-n">{rows.length} {t(rows.length === 1 ? "ticket" : "tickets")}</span></div>
          <label className="srch"><Search aria-hidden="true" /><span className="sr-only">{t("Search tickets")}</span>
            <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t("Search tickets")} autoComplete="off" /></label>
          <div className="tabs" role="tablist" aria-label={t("Ticket status")}>{["all", "open", "answered", "closed"].map(value => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>{t(value)}</button>)}</div>
        </div>
        {tickets.error && <p role="alert" className="p-4 text-destructive">{t("Could not load tickets.")}</p>}{tickets.isPending && <p className="p-4">{t("Loading…")}</p>}
        <ul className="threads">{rows.map(row => { const on = row.id === ticket?.id && !creating; const openTicket = () => { setSelected(row.id); setCreating(false); setShowThread(true); setText(""); }; return <li key={row.id} className={`th${on ? " on" : ""}`}>
          <div role="button" tabIndex={0} className="th-b" aria-current={on} onClick={openTicket} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openTicket(); } }}>
            <span className="av2" aria-hidden="true">{admin ? initials(row.artists?.stage_name ?? t("Client")) : <LifeBuoy className="size-[18px] text-gold" />}</span>
            <span className="th-t">
              <span className="th-r1"><b>{row.reference}</b><time>{day(row.created_at)}</time></span>
              <span className="th-pv">{row.message}</span>
              <span className="th-meta">{row.artists?.stage_name ?? t(admin ? "Client" : "Dealmaker support")} · {t(row.topic)}</span>
              <span className="th-lbl"><span className={`lbl ${STATUS_TONE[row.status] ?? "inquiry"}`}>{t(row.status)}</span></span>
            </span>
          </div>
        </li>; })}</ul>
        {!rows.length && !tickets.isPending && <div className="l-empty"><span className="orb"><LifeBuoy aria-hidden="true" /></span><b className="ibx-serif">{t("No tickets yet")}</b></div>}
      </aside>
      <section className="ibx-conv" aria-label={t("Support conversation")}>
        <header className="c-head">
          <button type="button" className="c-back" aria-label={t("Back to tickets")} onClick={() => { setShowThread(false); setCreating(false); }}><ArrowLeft className="size-[18px] rtl:rotate-180" /></button>
          <div className="c-who"><span className="c-av" aria-hidden="true"><LifeBuoy className="size-[18px] text-gold" /></span><div><b>{creating ? t("New support ticket") : ticket?.reference ?? t("Dealmaker support")}</b><small>{creating ? t("Master admin") : ticket ? t(ticket.topic) : ""}</small></div></div>
          {admin && ticket && <div className="c-act"><Button variant="outline" size="sm" disabled={busy} onClick={() => void changeStatus()}>{t(ticket.status === "closed" ? "Reopen" : "Close ticket")}</Button></div>}
        </header>
        {creating && <div className="support-topic"><Select value={topic} onValueChange={setTopic}><SelectTrigger aria-label={t("Topic")}><SelectValue /></SelectTrigger><SelectContent>{topics.map(value => <SelectItem key={value} value={value}>{t(value)}</SelectItem>)}</SelectContent></Select></div>}
        <div className="msgs" role="log" aria-live="polite">
          {!creating && ticket && !(messages.data ?? []).some(row => row.body === ticket.message && row.sender_role === "requester") && bubble("request", "requester", ticket.created_at, ticket.message)}
          {!creating && messages.data?.map(row => bubble(row.id, row.sender_role, row.created_at, row.body))}
          {messages.error && <p role="alert" className="text-destructive">{t("Could not load messages.")}</p>}
        </div>
        {(creating || ticket) && <form className="composer" onSubmit={event => { event.preventDefault(); void send(); }}><div className="cmp-row">
          <textarea aria-label={t("Support message")} placeholder={t(closed ? "This ticket is closed" : "Write a message…")} rows={2} maxLength={creating ? 2000 : 4000} disabled={closed} value={text} onChange={event => setText(event.target.value)} />
          <Button type="submit" aria-label={t("Send message")} disabled={busy || !text.trim() || closed}><Send className="size-[17px]" /><span>{t("Send")}</span></Button>
        </div></form>}
      </section>
    </div></div>;
}
