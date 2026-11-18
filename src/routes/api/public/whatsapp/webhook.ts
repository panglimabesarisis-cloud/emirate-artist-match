import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest } from "@lovable.dev/webhooks-js";

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WHATSAPP_API_KEY"];
        if (!secret) return new Response("Not configured", { status: 503 });
        let payload: unknown;
        try {
          ({ payload } = await verifyWebhookRequest({ req: request, secret, maxBodyBytes: 4 * 1024 * 1024 }));
        } catch {
          return new Response("Invalid signature", { status: 401 });
        }
        const deliveryId = request.headers.get("x-lovable-delivery");
        const event = request.headers.get("x-lovable-event");
        if (!deliveryId || !event) return new Response("Missing headers", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processEvent, processPending } = await import("@/lib/whatsapp.server");
        const { error: insErr } = await supabaseAdmin.from("whatsapp_webhook_events")
          .upsert({ delivery_id: deliveryId, event, payload: payload as never }, { onConflict: "delivery_id", ignoreDuplicates: true });
        if (insErr) return new Response("Storage failed", { status: 500 });
        const { data: row, error } = await supabaseAdmin.from("whatsapp_webhook_events").select("id, processed_at").eq("delivery_id", deliveryId).single();
        if (error || !row) return new Response("Storage failed", { status: 500 });
        if (!row.processed_at) {
          try { await processEvent(row.id, event, payload); }
          catch (e) {
            await supabaseAdmin.from("whatsapp_webhook_events").update({ processing_error: String(e).slice(0, 500) }).eq("id", row.id);
            return new Response("Processing failed", { status: 500 });
          }
        }
        // An unmatched status stays stored as pending; it is retried here on later deliveries and when new messages are sent.
        await processPending(10).catch(() => {});
        return new Response("ok");
      },
    },
  },
});
