import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Plus, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StudioHeading } from "@/components/dashboard/StudioPage";
import { useI18n } from "@/lib/i18n";
import "./support-workspace.css";
const topics = ["verification", "payout", "booking", "payment", "calendar", "technical", "account"];
const date = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
export function SupportWorkspace({ artistId, admin = false }: { artistId?: string; admin?: boolean }) {
  const { t } = useI18n(); const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null); const [creating, setCreating] = useState(false);
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
  return <div className="space-y-5"><StudioHeading title="Support" accent={admin ? "inbox" : "tickets"}>{!admin && <Button onClick={() => { setCreating(true); setText(""); }}><Plus className="size-4" />{t("New ticket")}</Button>}</StudioHeading>
    <div className="support-workspace"><aside className="support-ticket-list"><div className="space-y-3 p-4"><Input type="search" aria-label={t("Search tickets")} placeholder={t("Search tickets")} value={search} onChange={event => setSearch(event.target.value)} /><Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label={t("Ticket status")}><SelectValue /></SelectTrigger><SelectContent>{["all", "open", "answered", "closed"].map(value => <SelectItem key={value} value={value}>{t(value)}</SelectItem>)}</SelectContent></Select></div>
      {tickets.error && <p role="alert" className="p-4 text-destructive">{t("Could not load tickets.")}</p>}{tickets.isPending && <p className="p-4">{t("Loading…")}</p>}
      {rows.map(row => <Button key={row.id} variant="ghost" className="support-ticket" aria-pressed={row.id === ticket?.id && !creating} onClick={() => { setSelected(row.id); setCreating(false); setText(""); }}><span className="flex justify-between gap-2"><b>{row.reference}</b><Badge variant="outline">{t(row.status)}</Badge></span><span>{row.artists?.stage_name ?? t(admin ? "Client" : "Dealmaker support")} · {t(row.topic)}</span><small>{row.message}</small><small>{date(row.created_at)}</small></Button>)}
      {!rows.length && !tickets.isPending && <p className="p-4 text-sm text-muted-foreground">{t("No tickets yet")}</p>}</aside>
      <section className="support-thread" aria-label={t("Support conversation")}><header className="support-thread-header"><LifeBuoy className="size-5 text-gold" /><div className="min-w-0 flex-1"><h2>{creating ? t("New support ticket") : ticket?.reference ?? t("Dealmaker support")}</h2><small>{creating ? t("Master admin") : ticket ? t(ticket.topic) : ""}</small></div>{admin && ticket && <Button variant="outline" size="sm" disabled={busy} onClick={() => void changeStatus()}>{t(ticket.status === "closed" ? "Reopen" : "Close ticket")}</Button>}</header>
      {creating && <div className="p-4"><Select value={topic} onValueChange={setTopic}><SelectTrigger aria-label={t("Topic")}><SelectValue /></SelectTrigger><SelectContent>{topics.map(value => <SelectItem key={value} value={value}>{t(value)}</SelectItem>)}</SelectContent></Select></div>}
      <div className="support-thread-log" role="log" aria-live="polite">{!creating && ticket && !(messages.data ?? []).some(row => row.body === ticket.message && row.sender_role === "requester") && <article className="support-message"><small>{t("Request")} · {date(ticket.created_at)}</small><p dir="auto">{ticket.message}</p></article>}
        {!creating && messages.data?.map(row => <article key={row.id} className={`support-message ${row.sender_role === "admin" ? "is-admin" : ""}`}><small>{t(row.sender_role === "admin" ? "Dealmaker support" : "Request")} · {date(row.created_at)}</small><p dir="auto">{row.body}</p></article>)}{messages.error && <p role="alert" className="text-destructive">{t("Could not load messages.")}</p>}</div>
      {(creating || ticket) && <form className="support-composer" onSubmit={event => { event.preventDefault(); void send(); }}><Textarea aria-label={t("Support message")} placeholder={t(ticket?.status === "closed" && !creating ? "This ticket is closed" : "Write a message…")} rows={3} maxLength={creating ? 2000 : 4000} disabled={!creating && ticket?.status === "closed"} value={text} onChange={event => setText(event.target.value)} /><Button type="submit" size="icon" aria-label={t("Send message")} disabled={busy || !text.trim() || (!creating && ticket?.status === "closed")}><Send className="size-4" /></Button></form>}
      </section></div></div>;
}
