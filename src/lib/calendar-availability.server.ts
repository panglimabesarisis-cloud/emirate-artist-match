import { calendarWindow, busyOverlaps, type CalendarCheck } from "./calendar-rules";

/** Caller must derive ownerUserId from the authorized conversation's artist, never client input. */
export async function checkGoogleAvailability(ownerUserId: string, input: { date: string; startTime?: string | null; endTime?: string | null }): Promise<CalendarCheck> {
  const window = calendarWindow(input);
  const { getConnectionKeyForUser } = await import("./appUserConnections.server");
  const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
  try {
    const key = await getConnectionKeyForUser(ownerUserId, "google_calendar");
    if (!key) return { status: "unknown", window, reason: "The artist has not connected Google Calendar." };
    const res = await callAsAppUser({
      gatewayBaseUrl: "https://connector-gateway.lovable.dev", connectorId: "google_calendar", connectionAPIKey: key,
      path: "/calendar/v3/freeBusy", requiredScopes: ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/calendar.readonly"],
      init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeMin: window.timeMin, timeMax: window.timeMax, timeZone: "Asia/Dubai", items: [{ id: "primary" }] }) },
    });
    if (await appUserReconnectRequired(res)) return { status: "unknown", window, reason: "The artist needs to reconnect Google Calendar." };
    if (!res.ok) {
      console.error("Google Calendar availability failed", res.status, await res.text());
      return { status: "unknown", window, reason: `Google Calendar could not be checked (${res.status}).` };
    }
    const body = await res.json() as { calendars?: Record<string, { errors?: unknown[]; busy?: { start: string; end: string }[] }> };
    const calendar = body.calendars?.["primary"];
    if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy) || calendar.busy.some(b => !Number.isFinite(Date.parse(b.start)) || !Number.isFinite(Date.parse(b.end)))) return { status: "unknown", window, reason: "Google Calendar returned an incomplete availability result." };
    return { status: busyOverlaps(window, calendar.busy) ? "busy" : "available", window };
  } catch {
    console.error("Google Calendar availability unavailable");
    return { status: "unknown", window, reason: "Google Calendar could not be checked. Ask the artist to confirm." };
  }
}