import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { calendarAllowed, calendarDraftSchema, googleEventPayload } from "./my-agent-rules";
export const confirmMyAgentAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), cancel: z.boolean().optional() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: action, error } = await context.supabase
      .from("agent_actions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !action) throw new Error("Action not found");
    const owner = await context.supabase.rpc("is_artist_owner", { _artist: action.artist_id });
    if (owner.error || !owner.data)
      throw new Error("Only the artist owner can confirm this action");
    if (action.kind !== "calendar_event")
      throw new Error("Invoices are displayed privately, never sent to clients by this agent");
    if (action.status === "completed") return { ok: true };
    if (action.status !== "pending")
      throw new Error("This action is already processed. Check Calendar before trying again.");
    const { agentPlan } = await import("./my-agent-tools.server");
    const plan = await agentPlan(context.supabase, action.artist_id);
    if (!data.cancel && !calendarAllowed(plan.inheritedFeatures))
      throw new Error("Calendar sync is not included in your current subscription");
    const payload = calendarDraftSchema.parse(action.payload);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const claim = await supabaseAdmin
      .from("agent_actions")
      .update({
        status: data.cancel ? "cancelled" : "running",
        updated_at: new Date().toISOString(),
      })
      .eq("id", action.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (claim.error || !claim.data) throw new Error("Action already processed");
    if (data.cancel) return { ok: true };
    let attempted = false;
    try {
      const { getConnectionKeyForUser } = await import("./appUserConnections.server");
      const { callAsAppUser, appUserReconnectRequired } =
        await import("@/integrations/lovable/appUserConnector");
      const key = await getConnectionKeyForUser(context.userId, "google_calendar");
      if (!key) throw new Error("Connect your Google Calendar before creating an event");
      const event = googleEventPayload(payload, action.id);
      attempted = true;
      const response = await callAsAppUser({
        gatewayBaseUrl: "https://connector-gateway.lovable.dev",
        connectorId: "google_calendar",
        connectionAPIKey: key,
        path: `/calendar/v3/calendars/primary/events?sendUpdates=${payload.attendees.length ? "all" : "none"}`,
        requiredScopes: [
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/calendar.events",
        ],
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event),
        },
      });
      if (await appUserReconnectRequired(response)) {
        attempted = false;
        throw new Error(
          "Reconnect Google Calendar with permission to create events and invitations",
        );
      }
      if (!response.ok) {
        const text = await response.text();
        console.error("Private agent Calendar failed", response.status, text);
        attempted = response.status >= 500;
        throw new Error(
          `Google Calendar could not create the event (${response.status}). Check Calendar before retrying.`,
        );
      }
      const saved = await supabaseAdmin
        .from("agent_actions")
        .update({
          status: "completed",
          result: {
            title: payload.title,
            eventId: event.id,
            start: event.start.dateTime,
            end: event.end.dateTime,
            invited: payload.attendees.length,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", action.id);
      if (saved.error)
        throw new Error("Event created, but confirmation could not be saved. Check Calendar.");
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Calendar action failed";
      await supabaseAdmin
        .from("agent_actions")
        .update({
          status: attempted ? "unknown" : "failed",
          result: { error: message },
          updated_at: new Date().toISOString(),
        })
        .eq("id", action.id);
      return { ok: false, error: message };
    }
  });
