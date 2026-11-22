import { useMemo } from "react";
import { bookingRef, clientBookingState, paymentLabel, type Tone } from "@/lib/client-portal-rules";
import { useBookingExtras, useClientBookings, useClientQuotes, useThreads, type ClientBooking } from "./useClientPortal";
import type { ClientBookingExtras } from "@/lib/client-portal.functions";

export type PortalRow = {
  kind: "booking" | "request"; id: string; ref: string; artist: string; hue: number | null; slug: string | null; service: string; event: string;
  date: string | null; value: number; payment: { label: string; tone: Tone }; state: ReturnType<typeof clientBookingState>;
  booking: ClientBooking | null; extras: ClientBookingExtras[string] | null; threadId: string | null; createdAt: string;
};

/** Bookings plus quote requests that have not become a booking yet, newest first. */
export function usePortalRows(uid: string) {
  const bookings = useClientBookings(uid);
  const quotes = useClientQuotes(uid);
  const extras = useBookingExtras(uid);
  const threads = useThreads(uid);
  const rows = useMemo<PortalRow[]>(() => {
    const ex = extras.data ?? {};
    const out: PortalRow[] = (bookings.data ?? []).map((b) => {
      const e = ex[b.id] ?? null;
      return {
        kind: "booking", id: b.id, ref: bookingRef(b), artist: b.artists?.stage_name ?? "Artist", hue: b.artists?.hue ?? null, slug: b.artists?.slug ?? null,
        service: b.event_types?.name ?? "Booking", event: b.package_title ?? "Booking", date: b.event_date, value: Number(b.total),
        payment: paymentLabel(b), state: clientBookingState(b, !!e?.review), booking: b, extras: e, threadId: b.conversation_id, createdAt: b.created_at,
      };
    });
    const bookedThreads = new Set((bookings.data ?? []).map((b) => b.conversation_id).filter(Boolean));
    const threadByQuote = new Map((threads.data ?? []).filter((t) => t.quoteRequestId).map((t) => [t.quoteRequestId!, t.id]));
    for (const q of quotes.data ?? []) {
      const threadId = threadByQuote.get(q.id) ?? null;
      if (threadId && bookedThreads.has(threadId)) continue;
      const first = (q.message ?? "").split("\n").find((l) => l.trim()) ?? "Quote request";
      out.push({
        kind: "request", id: q.id, ref: `RQ-${q.id.slice(0, 8).toUpperCase()}`, artist: q.artists?.stage_name ?? "Artist", hue: q.artists?.hue ?? null, slug: q.artists?.slug ?? null,
        service: "Quote request", event: first.replace(/^Event:\s*/i, "").slice(0, 80), date: q.event_date, value: Number(q.budget ?? 0),
        payment: { label: "Not invoiced", tone: "plain" },
        state: { key: "request", label: q.status === "closed" ? "Closed" : q.status === "replied" ? "Artist replied" : "Request sent", tone: q.status === "closed" ? "plain" : "gold", action: "chat" },
        booking: null, extras: null, threadId, createdAt: q.created_at,
      });
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [bookings.data, quotes.data, extras.data, threads.data]);
  return { rows, isLoading: bookings.isLoading || quotes.isLoading, error: bookings.error ?? quotes.error ?? null };
}
