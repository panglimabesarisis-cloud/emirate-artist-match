import { createFileRoute } from "@tanstack/react-router";
import { buildIcs } from "@/lib/ics";

// Private calendar feed. The unguessable per-artist token is the credential;
// artists can rotate it from the dashboard to revoke old links.
export const Route = createFileRoute("/api/public/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token.replace(/\.ics$/, "");
        if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: cal } = await supabaseAdmin.from("artist_calendar").select("artist_id, artists(stage_name)").eq("token", token).maybeSingle();
        if (!cal) return new Response("Not found", { status: 404 });
        const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
        const [{ data: bookings }, { data: blocks }] = await Promise.all([
          supabaseAdmin.from("bookings").select("id, client_name, package_title, event_date, status, guests, invoice_no").eq("artist_id", cal.artist_id).is("deleted_at", null).in("status", ["confirmed", "completed", "quoted", "inquiry"]).gte("event_date", since),
          supabaseAdmin.from("availability").select("id, date, note").eq("artist_id", cal.artist_id).gte("date", since),
        ]);
        const label: Record<string, string> = { confirmed: "Booked", completed: "Done", quoted: "Offer sent", inquiry: "Needs approval" };
        const events = [
          ...(bookings ?? []).map((b) => ({ uid: b.id, date: b.event_date, title: `${label[b.status] ?? b.status}: ${b.package_title ?? "Performance"} – ${b.client_name}`, description: [b.invoice_no && `Invoice ${b.invoice_no}`, b.guests && `${b.guests} guests`, "Manage on Dealmaker"].filter(Boolean).join("\n") })),
          ...(blocks ?? []).map((a) => ({ uid: `block-${a.id}`, date: a.date, title: `Unavailable${a.note ? ` – ${a.note}` : ""}` })),
        ];
        const name = (cal.artists as { stage_name: string } | null)?.stage_name ?? "Artist";
        return new Response(buildIcs(`${name} · Dealmaker`, events), {
          headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
        });
      },
    },
  },
});
