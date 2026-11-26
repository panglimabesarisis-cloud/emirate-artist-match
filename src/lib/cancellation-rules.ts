/** A client asks to cancel; the database enforces the same rules (`request_cancellation`, 0102). */
import { daysUntil } from "./booking-rules";

/** No cancellation within this many days of the event. */
export const CANCEL_NOTICE_DAYS = 7;
export const CANCEL_REASON = { min: 20, max: 1000 } as const;

export function cancellationBlock(status: string, eventDate: string | null, now = new Date()): string | null {
  if (!["inquiry", "quoted", "confirmed"].includes(status)) return "This booking cannot be cancelled.";
  if (eventDate && daysUntil(eventDate, now) <= CANCEL_NOTICE_DAYS) return "Bookings cannot be cancelled within 7 days of the event.";
  return null;
}

/** The refund the booking terms suggest; the administrator decides the final amount. */
export function suggestedRefund(paid: number, eventDate: string | null, now = new Date()) {
  const days = eventDate ? daysUntil(eventDate, now) : Infinity;
  return days <= CANCEL_NOTICE_DAYS ? 0 : days >= 14 ? paid : Math.round(paid * 50) / 100;
}
