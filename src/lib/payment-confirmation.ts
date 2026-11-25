/** The reply a client sees after paying a booking: fixed wording, filled from the saved booking. */
import { invoiceMoney } from "./invoice";
import { maskContacts } from "./masking";
import type { BookingDraft } from "./booking-rules";

export const CLIENT_DASHBOARD_URL = "https://dealmakertalent.com/client/dashboard";

const DETAIL_KEYS = ["venueName", "venueAddress", "eventType", "indoorOutdoor", "performDuration", "wardrobe", "dresscode", "wardrobeRequest",
  "preEventMeeting", "rehearsalDate", "rehearsalStart", "rehearsalEnd", "rehearsalLocation"] as const;
export type EventDetails = Partial<Record<(typeof DETAIL_KEYS)[number], string>>;

/** The event facts of a booking draft, kept with the booking. */
export function eventDetails(source: BookingDraft | Record<string, unknown> | null | undefined): EventDetails {
  const values = (source ?? {}) as Record<string, unknown>;
  const found: EventDetails = {};
  for (const key of DETAIL_KEYS) {
    const value = values[key];
    if (typeof value === "string" && value.trim()) found[key] = value.trim().slice(0, 200);
  }
  return found;
}

/** Bookings saved before the details had their own field kept some of them as note lines. */
export function noteDetails(notes: string | null | undefined): EventDetails {
  const line = (label: string) => new RegExp(`^${label}:\\s*(.+)$`, "mi").exec(notes ?? "")?.[1]?.trim();
  return eventDetails({ venueName: line("Venue"), venueAddress: line("Venue address"), performDuration: line("Performance duration") });
}

const longDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))
  : value;

export type Confirmation = {
  clientName: string; amount: number; artistName: string; eventDate: string | null; jobDetail: string | null;
  eventName: string | null; startTime: string | null; endTime: string | null; area: string | null; details: EventDetails;
};

export function paymentConfirmation(input: Confirmation): string {
  // Client and AI text never carries contact details; the two links below are the server's own.
  const safe = (value: string | null | undefined, max = 200) => (value?.trim() ? maskContacts(value.trim()).slice(0, max) : "-");
  const d = input.details;
  const time = [input.startTime, input.endTime].filter(Boolean).map(value => value!.slice(0, 5)).join("-");
  const place = [d.venueName, d.venueAddress, input.area].filter((value): value is string => !!value?.trim()).map(value => maskContacts(value.trim()));
  const map = place.length ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.join(", ").slice(0, 300))}` : "-";
  return [
    [`Thank you! ${safe(input.clientName, 120)}`, `Your payment: ${invoiceMoney(input.amount)} (including VAT)`, "Status: Received / Paid"],
    ["---", `This payment is for booking: ${safe(input.artistName)}`, `Date Confirmed: ${input.eventDate ? longDate(input.eventDate) : "-"}`],
    ["---", "Job Detail:", safe(input.jobDetail, 800)],
    ["-----", `Event Name: ${safe(d.eventType ?? input.eventName)}`, `Date Event: ${input.eventDate ?? "-"}`, `Event Time: ${time || "-"}`, `Event Type: ${safe(d.indoorOutdoor)}`],
    ["-----", `Artist Perform Duration: ${safe(d.performDuration)}`, `Wardrobe: ${safe(d.wardrobe)}`, `Dress Code: ${safe(d.dresscode)}`, `Wardrobe Request: ${safe(d.wardrobeRequest)}`],
    ["-----", `Pre-Event Meeting: ${safe(d.preEventMeeting)}`],
    ["-----", "Rehearsal Detail", `Date: ${d.rehearsalDate ? safe(longDate(d.rehearsalDate)) : "-"}`, `Time Start: ${safe(d.rehearsalStart)}`, `End Time: ${safe(d.rehearsalEnd)}`, `Location: ${safe(d.rehearsalLocation)}`],
    ["--", `Link Location: ${map}`, "We look forward to a great event!"],
    ["---", "We give you a commission on every booking you make. Please check your dashboard here:", CLIENT_DASHBOARD_URL],
  ].map(section => section.join("\n")).join("\n").slice(0, 4000);
}
