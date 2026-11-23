import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LifeBuoy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StudioEmpty, StudioSection } from "@/components/dashboard/StudioPage";
import { useI18n } from "@/lib/i18n";

const TOPICS = [
  ["verification", "Verification"], ["payout", "Payout / wallet"], ["booking", "Booking assistance"], ["payment", "Payment issue"],
  ["calendar", "Calendar"], ["technical", "Technical issue"], ["account", "Account support"],
] as const;
type Topic = (typeof TOPICS)[number][0];
const LABEL: Record<string, string> = Object.fromEntries(TOPICS);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }) : "");
const selectCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Artist Support Center: tickets go to the Master Admin support inbox; replies appear here. */
export function ArtistSupport({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [topic, setTopic] = useState<Topic>("verification");
  const [booking, setBooking] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const key = ["artist-support", artistId];
  const list = useQuery({
    queryKey: key, refetchInterval: 60000,
    queryFn: async () => {
      const r = await supabase.from("support_requests").select("id, reference, topic, booking_id, message, status, admin_reply, replied_at, created_at").eq("artist_id", artistId).order("created_at", { ascending: false }).limit(50);
      if (r.error) throw new Error("Unable to load support requests");
      return r.data ?? [];
    },
  });
  const bookings = useQuery({
    queryKey: ["artist-support-bookings", artistId],
    queryFn: async () => (await supabase.from("bookings").select("id, event_date, client_name").eq("artist_id", artistId).is("deleted_at", null).order("event_date", { ascending: false }).limit(50)).data ?? [],
  });
  const tooShort = message.trim().length < 10;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (tooShort) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("support_requests").insert({ topic, artist_id: artistId, booking_id: booking || null, message: message.trim().slice(0, 2000), user_id: u.user?.id ?? "" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("Support request sent. Our team replies here."));
    setMessage(""); setBooking("");
    await qc.invalidateQueries({ queryKey: key });
  };
  return (
    <div className="space-y-6">
      <StudioSection title={t("Contact support")} accent="center" subtitle={t("Reach the Dealmaker team about verification, payouts, bookings or technical issues.")}>
        <form onSubmit={submit} className="grid gap-4 p-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5"><Label htmlFor="sup-topic">{t("Topic")}</Label>
              <select id="sup-topic" className={selectCls} value={topic} onChange={(e) => setTopic(e.target.value as Topic)}>{TOPICS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></div>
            <div className="grid gap-1.5"><Label htmlFor="sup-booking">{t("Related booking (optional)")}</Label>
              <select id="sup-booking" className={selectCls} value={booking} onChange={(e) => setBooking(e.target.value)}>
                <option value="">{t("None")}</option>
                {(bookings.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.id.slice(0, 8).toUpperCase()} · {b.event_date ?? ""} {b.client_name ?? ""}</option>)}
              </select></div>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="sup-msg">{t("Message")}</Label>
            <Textarea id="sup-msg" rows={5} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("Describe the issue (at least 10 characters)")} dir="auto" /></div>
          <div><Button type="submit" disabled={busy || tooShort}><LifeBuoy aria-hidden="true" />{t(busy ? "Sending…" : "Submit support request")}</Button></div>
        </form>
      </StudioSection>
      <StudioSection title={t("Your requests")} accent="history">
        {list.error ? <p className="p-4 text-sm text-destructive">{t("Unable to load support requests.")}</p> : (list.data ?? []).length === 0 ? <StudioEmpty title={t("No requests yet")} icon={LifeBuoy} /> : (
          <div className="divide-y rounded-xl border">
            {(list.data ?? []).map((r) => (
              <div key={r.id} className="space-y-2 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2"><b>{r.reference}</b><span className="text-muted-foreground">· {t(LABEL[r.topic] ?? r.topic)} · {when(r.created_at)}</span><Badge variant={r.status === "open" ? "secondary" : r.status === "answered" ? "default" : "outline"} className="ms-auto">{t(r.status)}</Badge></div>
                <p className="whitespace-pre-wrap" dir="auto">{r.message}</p>
                {r.booking_id && <p className="text-xs text-muted-foreground">{t("Booking")} {r.booking_id.slice(0, 8).toUpperCase()}</p>}
                {r.admin_reply && <div className="rounded-lg border-s-4 border-primary bg-muted p-3"><p className="text-xs font-semibold">{t("Dealmaker team")} · {when(r.replied_at)}</p><p className="whitespace-pre-wrap" dir="auto">{r.admin_reply}</p></div>}
              </div>
            ))}
          </div>
        )}
      </StudioSection>
    </div>
  );
}
