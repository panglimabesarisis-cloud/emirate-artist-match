import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Ban, FileText, Search, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CANCEL_REASON } from "@/lib/cancellation-rules";
import { daysUntil } from "@/lib/booking-rules";
import { decideCancellation } from "@/lib/cancellations.functions";
import { initials } from "@/lib/format";
import { BookingInvoiceById } from "./documents/BookingInvoice";
import "@/components/dashboard/inbox.css";
import "@/components/dashboard/chat-fields.css";
import "@/components/support/support-workspace.css";

const aed = (n: number | string | null | undefined) => `AED ${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stamp = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
const LABEL: Record<string, { text: string; tone: string }> = { pending: { text: "Waiting", tone: "partial" }, processing: { text: "Processing", tone: "partial" }, approved: { text: "Approved", tone: "paid" }, rejected: { text: "Rejected", tone: "inquiry" } };

export function useCancellations() {
  return useQuery({
    queryKey: ["admin-cancellations"], refetchInterval: 15000,
    queryFn: async () => {
      const r = await supabase.from("cancellation_requests").select("*, bookings(invoice_no, package_title, event_date, total, client_name, client_email, artists(stage_name))").order("created_at", { ascending: false }).limit(200);
      if (r.error) throw new Error("Unable to load cancellation requests");
      return r.data ?? [];
    },
  });
}

/** Cancellation requests as an inbox: the list, the conversation with the client, and the decision. */
export function AdminCancellations() {
  const list = useCancellations();
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const name = (r: NonNullable<typeof list.data>[number]) => r.bookings?.client_name ?? "Client";
  const rows = (list.data ?? []).filter((r) => (filter === "all" || r.status === filter) && `${r.reference} ${name(r)} ${r.bookings?.artists?.stage_name ?? ""} ${r.reason}`.toLowerCase().includes(search.trim().toLowerCase()));
  const current = (list.data ?? []).find((r) => r.id === selected) ?? rows[0];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Clients cannot cancel on their own. Chat with the client, then approve or reject with a clear reason. Requests are not accepted within 7 days of the event.</p>
      <div className={`ibx-root support-ibx${open ? " open" : ""}`}>
        <aside className="ibx-list" aria-label="Cancellation requests">
          <div className="l-head">
            <div className="l-title"><h2 className="ibx-serif">Requests</h2><span className="l-n">{rows.length}</span></div>
            <label className="srch"><Search aria-hidden="true" /><span className="sr-only">Search requests</span><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search requests" autoComplete="off" /></label>
            <div className="tabs" role="tablist" aria-label="Request status">{["all", "pending", "approved", "rejected"].map((v) => <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)}>{v === "pending" ? "waiting" : v}</button>)}</div>
          </div>
          {list.error && <p role="alert" className="p-4 text-destructive">Unable to load cancellation requests.</p>}
          <ul className="threads">{rows.map((r) => { const label = LABEL[r.status] ?? LABEL["pending"]!; return (
            <li key={r.id} className={`th${r.id === current?.id ? " on" : ""}`}>
              <button type="button" className="th-b w-full text-start" aria-current={r.id === current?.id} onClick={() => { setSelected(r.id); setOpen(true); }}>
                <span className="av2" aria-hidden="true">{initials(name(r))}</span>
                <span className="th-t">
                  <span className="th-r1"><b>{name(r)}</b><time>{new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</time></span>
                  <span className="th-pv">{r.reason}</span>
                  <span className="th-meta">{r.reference} · {r.bookings?.artists?.stage_name ?? "Artist"}</span>
                  <span className="th-lbl"><span className={`lbl ${label.tone}`}>{label.text}</span>{r.bookings?.event_date && r.status === "pending" && <span className="lbl inquiry">{daysUntil(r.bookings.event_date)} days to event</span>}</span>
                </span>
              </button>
            </li>
          ); })}</ul>
          {!rows.length && !list.isPending && <div className="l-empty"><span className="orb"><Ban aria-hidden="true" /></span><b className="ibx-serif">No requests</b></div>}
        </aside>
        <section className="ibx-conv" aria-label="Cancellation conversation">
          {current ? <Thread key={current.id} request={current} onBack={() => setOpen(false)} /> : <div className="msgs"><p className="adm-meta">Select a request.</p></div>}
        </section>
      </div>
    </div>
  );
}

function Thread({ request: r, onBack }: { request: NonNullable<ReturnType<typeof useCancellations>["data"]>[number]; onBack: () => void }) {
  const qc = useQueryClient();
  const decide$ = useServerFn(decideCancellation);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [refund, setRefund] = useState(String(Number(r.suggested_refund)));
  const [keep, setKeep] = useState<"artist" | "platform" | null>(null);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState(false);
  const [deciding, setDeciding] = useState<"approve" | "reject" | null>(null);
  const messages = useQuery({
    queryKey: ["cancellation-messages", r.ticket_id], enabled: !!r.ticket_id, refetchInterval: 5000,
    queryFn: async () => {
      const res = await supabase.from("support_ticket_messages").select("id, sender_role, body, created_at").eq("ticket_id", r.ticket_id!).order("created_at");
      if (res.error) throw new Error("Unable to load messages");
      return res.data ?? [];
    },
  });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["admin-cancellations"] }), qc.invalidateQueries({ queryKey: ["cancellation-messages"] })]);
  const send = async () => {
    if (!text.trim() || !r.ticket_id || busy) return;
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const res = await supabase.from("support_ticket_messages").insert({ ticket_id: r.ticket_id, sender_id: auth.user?.id ?? "", sender_role: "admin", body: text.trim() });
    setBusy(false);
    if (res.error) { toast.error("Could not send the message"); return; }
    setText(""); await refresh();
  };
  const paid = Number(r.paid_amount);
  const amount = Number(refund);
  const rest = Math.max(0, Math.round((paid - amount) * 100) / 100);
  const noteOk = note.trim().length >= CANCEL_REASON.min;
  const approveOk = noteOk && Number.isFinite(amount) && amount >= 0 && amount <= paid && (rest === 0 || !!keep);
  const decide = async (approve: boolean) => {
    if (!confirm(approve ? `Cancel this booking and refund ${aed(amount)}? This cannot be undone.` : "Reject this cancellation request?")) return;
    setBusy(true);
    try {
      await decide$({ data: { id: r.id, approve, refund: approve ? amount : 0, retainedTo: approve && rest > 0 ? keep : null, note: note.trim() } });
      toast.success(approve ? "Cancellation approved" : "Cancellation rejected");
      setDeciding(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not record the decision"); }
    finally { setBusy(false); await refresh(); }
  };
  const label = LABEL[r.status] ?? LABEL["pending"]!;
  return (
    <>
      <header className="c-head">
        <button type="button" className="c-back" aria-label="Back to requests" onClick={onBack}><ArrowLeft className="size-[18px]" /></button>
        <div className="c-who"><span className="c-av" aria-hidden="true">{initials(r.bookings?.client_name ?? "Client")}</span><div><b>{r.bookings?.client_name ?? "Client"} · {r.reference}</b><small>{r.bookings?.artists?.stage_name} · {r.bookings?.package_title ?? "Booking"} · event {r.bookings?.event_date ?? "—"}</small></div></div>
        <div className="c-act"><span className={`adm-pill is-${r.status === "approved" ? "paid" : r.status === "rejected" ? "rejected" : "pending"}`}>{label.text}</span><Button variant="outline" size="sm" onClick={() => setInvoice(true)}><FileText />Invoice</Button></div>
      </header>
      <div className="msgs" role="log" aria-live="polite">
        <div className="rounded-xl border p-3 text-sm"><b>Reason given</b><p className="mt-1 whitespace-pre-wrap" dir="auto">{r.reason}</p><p className="adm-meta mt-2">Paid {aed(paid)} · suggested refund {aed(r.suggested_refund)} · asked {stamp(r.created_at)}</p></div>
        {messages.data?.map((m) => <article key={m.id} className={`m ${m.sender_role === "admin" ? "you" : "client"}`}><span className="who">{m.sender_role === "admin" ? "Dealmaker support" : "Client"}</span><div className="bub" dir="auto">{m.body}</div><time>{stamp(m.created_at)}</time></article>)}
        {messages.error && <p role="alert" className="text-destructive">Unable to load messages.</p>}
        {r.status === "approved" && <p className="rounded-xl border p-3 text-sm">Refunded {aed(r.refund_amount)}{r.retained_to ? `; the rest goes to the ${r.retained_to}` : ""}. {r.decision_note}</p>}
        {r.status === "rejected" && <p className="rounded-xl border p-3 text-sm">Rejected: {r.decision_note}</p>}
      </div>
      {r.status === "pending" && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-4 py-3">
        <span className="me-auto text-sm text-muted-foreground">Chat below, then decide.</span>
        <Button variant="outline" onClick={() => setDeciding("reject")}>Reject</Button><Button onClick={() => setDeciding("approve")}>Approve</Button>
      </div>}
      <Dialog open={!!deciding} onOpenChange={(value) => { if (!value) setDeciding(null); }}>
        <DialogContent className="max-h-[calc(100dvh-32px)] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{deciding === "approve" ? "Approve cancellation" : "Reject cancellation"}</DialogTitle><DialogDescription>{r.reference} · paid {aed(paid)} · suggested refund {aed(r.suggested_refund)}</DialogDescription></DialogHeader>
          {deciding === "approve" && <>
            <div className="space-y-1"><Label htmlFor="cx-refund">Refund to client (AED)</Label><Input id="cx-refund" type="number" min={0} max={paid} step="0.01" value={refund} disabled={paid === 0} onChange={(e) => setRefund(e.target.value)} /></div>
            <fieldset className="space-y-1" disabled={rest === 0}><legend className="text-sm font-medium">The rest ({aed(rest)}) goes to</legend>
              <div className="flex flex-wrap gap-2">{(["artist", "platform"] as const).map((v) => <Button key={v} type="button" size="sm" variant={keep === v ? "default" : "outline"} aria-pressed={keep === v} onClick={() => setKeep(v)}>{v === "artist" ? "Artist (less commission)" : "Platform"}</Button>)}</div>
            </fieldset>
          </>}
          <div className="space-y-1"><Label htmlFor="cx-note">Reason for your decision (sent to the client)</Label><Textarea id="cx-note" rows={3} maxLength={CANCEL_REASON.max} value={note} onChange={(e) => setNote(e.target.value)} /><p className="adm-meta">{note.trim().length} / at least {CANCEL_REASON.min} characters</p></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeciding(null)}>Back</Button>
            <Button disabled={busy || (deciding === "approve" ? !approveOk : !noteOk)} onClick={() => void decide(deciding === "approve")}>{deciding === "approve" ? "Approve cancellation" : "Reject request"}</Button></div>
        </DialogContent>
      </Dialog>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(); }}><div className="cmp-row">
        <textarea aria-label="Message to the client" placeholder="Chat with the client…" rows={2} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" aria-label="Send message" disabled={busy || !text.trim()}><Send className="size-[17px]" /><span>Send</span></Button>
      </div></form>
      {invoice && <BookingInvoiceById bookingId={r.booking_id} onClose={() => setInvoice(false)} />}
    </>
  );
}
