import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

/** The conversation of one support request, where the client reads replies and answers. */
export function SupportThread({ ticketId, uid, closed }: { ticketId: string; uid: string; closed: boolean }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const messages = useQuery({
    queryKey: ["client-ticket", ticketId], enabled: open, refetchInterval: 5000,
    queryFn: async () => {
      const r = await supabase.from("support_ticket_messages").select("id, sender_role, body, created_at").eq("ticket_id", ticketId).order("created_at");
      if (r.error) throw new Error(r.error.message);
      return r.data ?? [];
    },
  });
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const { error } = await supabase.from("support_ticket_messages").insert({ ticket_id: ticketId, sender_id: uid, sender_role: "requester", body: text.trim() });
    setBusy(false);
    if (error) { toast.error(t("Could not send message.")); return; }
    setText(""); await qc.invalidateQueries({ queryKey: ["client-ticket", ticketId] });
  };
  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" className="cp-btn cp-btn-line" aria-expanded={open} onClick={() => setOpen(!open)}>{t(open ? "Hide conversation" : "Open conversation")}</button>
      {open && <div style={{ marginTop: 8 }}>
        <div role="log" aria-live="polite">
          {messages.data?.map((m) => <div key={m.id} className="cp-review-card" style={{ marginBottom: 8, marginInlineStart: m.sender_role === "admin" ? 0 : 32 }}><b>{t(m.sender_role === "admin" ? "Dealmaker support" : "You")}</b><p dir="auto" style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{m.body}</p></div>)}
          {messages.error && <p role="alert">{t("Could not load messages.")}</p>}
        </div>
        {closed ? <p className="cp-muted cp-small">{t("This ticket is closed")}</p> : (
          <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="cp-row" style={{ gap: 8, alignItems: "flex-end" }}>
            <textarea aria-label={t("Support message")} maxLength={4000} rows={2} style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Write a message…")} />
            <button type="submit" className="cp-btn cp-btn-gold" disabled={busy || !text.trim()}>{t("Send")}</button>
          </form>
        )}
      </div>}
    </div>
  );
}
