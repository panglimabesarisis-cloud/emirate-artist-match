import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev";
const CONNECTOR = "google_calendar";
const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export const startCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientKey = process.env["GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientKey) throw new Error("Google Calendar is not set up yet");
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/api/oauth/google_calendar/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY, connectorId: CONNECTOR, appUserId: context.userId, clientAPIKey: clientKey, returnUrl,
      credentialsConfiguration: { scopes: SCOPES },
    });
    return { authorizationUrl };
  });

export const completeCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { code: string }) => ({ code: String(i.code).slice(0, 500) }))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("@/lib/appUserConnections.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY, data.code);
    if (connectorId !== CONNECTOR) throw new Error("OAuth completion returned the wrong connector");
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    return { ok: true };
  });

export const disconnectCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser, deleteConnectionForUser } = await import("@/lib/appUserConnections.server");
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const k = await getConnectionKeyForUser(context.userId, CONNECTOR);
    if (k) await disconnectAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: k, connectorId: CONNECTOR });
    await deleteConnectionForUser(context.userId, CONNECTOR);
    return { ok: true };
  });

export type CalEvent = { id: string; title: string; start: string; end: string; allDay: boolean };

/** Events from the signed-in artist's own Google Calendar for one month (YYYY-MM). */
export const getCalendarEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { month: string }) => {
    if (!/^\d{4}-\d{2}$/.test(i.month)) throw new Error("Bad month");
    return i;
  })
  .handler(async ({ data, context }): Promise<{ connected: boolean; reconnectRequired?: boolean; email?: string | undefined; events: CalEvent[] }> => {
    const { getConnectionKeyForUser } = await import("@/lib/appUserConnections.server");
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const k = await getConnectionKeyForUser(context.userId, CONNECTOR);
    if (!k) return { connected: false, events: [] };
    const [y, m] = data.month.split("-").map(Number) as [number, number];
    const from = new Date(Date.UTC(y, m - 1, 1) - 86400000).toISOString();
    const to = new Date(Date.UTC(y, m, 1) + 86400000).toISOString();
    const q = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
    const res = await callAsAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: k, connectorId: CONNECTOR, path: `/calendar/v3/calendars/primary/events?${q}`, requiredScopes: SCOPES });
    if (await appUserReconnectRequired(res)) return { connected: false, reconnectRequired: true, events: [] };
    if (!res.ok) { console.error("Calendar events failed", res.status, await res.text()); throw new Error(`Google Calendar request failed (${res.status})`); }
    const body = (await res.json()) as { summary?: string; items?: { id: string; summary?: string; status?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } }[] };
    const events = (body.items ?? []).filter((e) => e.status !== "cancelled").map((e) => ({
      id: e.id, title: e.summary ?? "Busy",
      start: e.start?.dateTime ?? e.start?.date ?? "", end: e.end?.dateTime ?? e.end?.date ?? "", allDay: !e.start?.dateTime,
    }));
    return { connected: true, email: body.summary, events };
  });
