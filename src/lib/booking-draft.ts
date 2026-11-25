/** What a visitor typed on an artist page, kept while they leave to sign in. */
export type BookingDraftState = { artistId: string; send: "form" | "chat"; state: Record<string, unknown> };
const KEY = "dm_booking_draft";
const LIFETIME = 30 * 60_000;

export function saveBookingDraft(draft: BookingDraftState, now = Date.now()) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...draft, at: now })); } catch { /* the visitor types it again */ }
}

/** Returns this artist's draft once; an old or foreign one is ignored. */
export function takeBookingDraft(artistId: string, now = Date.now()): BookingDraftState | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as (BookingDraftState & { at: number }) | null;
    if (!value || value.artistId !== artistId) return null;
    sessionStorage.removeItem(KEY);
    return now - value.at <= LIFETIME && (value.send === "form" || value.send === "chat") && value.state && typeof value.state === "object" ? value : null;
  } catch { return null; }
}
