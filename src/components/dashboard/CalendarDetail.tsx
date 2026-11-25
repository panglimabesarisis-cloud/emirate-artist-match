import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MapPin, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { chatAnswers, type ChatLine } from "@/lib/chat-answers";
import { eventDetails, noteDetails } from "@/lib/payment-confirmation";
import { aed } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

type Detail = {
  guests: number | null; job_detail: string | null; notes: string | null; event_details: Record<string, unknown> | null; invoice_no: string | null;
  deposit_pct: number | null; job_kind: string | null; work_ready_at: string | null; event_type: string | null; area: string | null;
  perform_minutes: number | null; request: string | null; conversation_id: string | null; messages: ChatLine[] | null;
};
export type CalendarBooking = { id: string; total: number | string; paid_amount: number | string };
type Row = [string, string | number | null | undefined];

function Section({ title, rows }: { title: string; rows: Row[] }) {
  const { t } = useI18n();
  const filled = rows.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");
  if (!filled.length) return null;
  return <section className="space-y-1">
    <h4 className="text-[11px] font-extrabold uppercase tracking-[.12em] text-gold">{t(title)}</h4>
    <dl className="text-sm">{filled.map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(96px,38%)_minmax(0,1fr)] gap-3 border-b border-border py-2">
      <dt className="break-words text-muted-foreground">{t(label)}</dt><dd className="whitespace-pre-wrap break-words" dir="auto">{value}</dd>
    </div>)}</dl>
  </section>;
}

/** Everything the booking and its chat hold about one event, in the calendar's side column. */
export function CalendarDetail({ artistId, booking }: { artistId: string; booking: CalendarBooking }) {
  const { t } = useI18n();
  const detail = useQuery({
    queryKey: ["cal-detail", artistId, booking.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("team_booking_detail", { _artist: artistId, _booking: booking.id });
      if (error) throw error;
      return data as unknown as Detail | null;
    },
  });
  if (detail.isPending) return <p role="status" className="text-sm text-muted-foreground">{t("Loading…")}</p>;
  if (detail.error || !detail.data) return <p role="alert" className="text-sm text-destructive">{t("Could not load the event detail.")}</p>;
  const d = detail.data;
  const event = { ...noteDetails(d.notes), ...eventDetails(d.event_details) };
  const answers = chatAnswers(d.messages ?? []);
  const venue = [event.venueName, event.venueAddress, d.area].filter(Boolean).join(", ");
  const total = Number(booking.total), paid = Number(booking.paid_amount);
  return <div className="space-y-5">
    <Section title="Event" rows={[
      ["Event name", event.eventType ?? d.event_type], ["Event type", event.indoorOutdoor], ["Venue", venue], ["Guests", d.guests],
      ["Performance duration", event.performDuration ?? (d.perform_minutes ? `${d.perform_minutes} ${t("minutes")}` : null)], ["Job detail", d.job_detail],
    ]} />
    {venue && <a className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`}><MapPin className="h-4 w-4" aria-hidden />{t("Open in Google Maps")}</a>}
    <Section title="Wardrobe and rehearsal" rows={[
      ["Wardrobe", event.wardrobe], ["Dress code", event.dresscode], ["Wardrobe request", event.wardrobeRequest], ["Pre-event meeting", event.preEventMeeting],
      ["Rehearsal date", event.rehearsalDate], ["Rehearsal start", event.rehearsalStart], ["Rehearsal end", event.rehearsalEnd], ["Rehearsal location", event.rehearsalLocation],
    ]} />
    <Section title="From the chat" rows={answers.map(answer => [answer.label, answer.value])} />
    <Section title="Payment" rows={[
      ["Total", aed(total)], ["Paid", aed(paid)], ["Balance", aed(Math.max(0, total - paid))], ["Deposit", d.deposit_pct ? `${d.deposit_pct}%` : null], ["Invoice", d.invoice_no],
      ["Balance requested", d.work_ready_at ? new Date(d.work_ready_at).toLocaleDateString("en-GB") : null],
    ]} />
    <Section title="Notes" rows={[["Notes", d.notes], ["Client request", d.request]]} />
    {d.conversation_id && <Button asChild className="w-full rounded-full bg-gradient-gold font-bold text-gold-foreground"><Link to="/dashboard/chat/$id" params={{ id: d.conversation_id }}><MessageSquare className="me-1.5 h-4 w-4" aria-hidden />{t("Open the chat")}</Link></Button>}
  </div>;
}
