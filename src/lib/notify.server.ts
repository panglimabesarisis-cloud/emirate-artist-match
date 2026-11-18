import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Target = { email?: string | null; phone?: string | null };
const GATEWAY = "https://connector-gateway.lovable.dev/whatsapp";

async function log(bookingId: string, channel: "email" | "whatsapp", audience: "client" | "artist", kind: string, recipient: string, status: string, error?: string) {
  await supabaseAdmin.from("notifications").insert({ booking_id: bookingId, channel, audience, kind, recipient, status, error: error?.slice(0, 500) ?? null });
}

async function sendWhatsApp(phone: string, text: string) {
  const lk = process.env["LOVABLE_API_KEY"], wk = process.env["WHATSAPP_API_KEY"];
  if (!lk || !wk) return { status: "pending_setup" };
  const to = phone.replace(/\D/g, "");
  const r = await fetch(`${GATEWAY}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": wk, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
  if (!r.ok) return { status: "failed", error: `${r.status} ${await r.text()}` };
  return { status: "sent" };
}

/**
 * Sends a booking link by email and WhatsApp. Every attempt is logged in `notifications`.
 * Email stays `pending_setup` until a sender domain is configured; WhatsApp until the connector is linked.
 */
export async function notifyBooking(bookingId: string, audience: "client" | "artist", kind: string, to: Target, subject: string, text: string) {
  if (to.email) await log(bookingId, "email", audience, kind, to.email, "pending_setup");
  if (to.phone) {
    try {
      const r = await sendWhatsApp(to.phone, `${subject}\n\n${text}`);
      await log(bookingId, "whatsapp", audience, kind, to.phone, r.status, r.error);
    } catch (e) { await log(bookingId, "whatsapp", audience, kind, to.phone, "failed", String(e)); }
  }
}

export async function artistContact(artistId: string) {
  const { data: a } = await supabaseAdmin.from("artists").select("user_id, notify_phone, stage_name").eq("id", artistId).single();
  let email: string | null = null;
  if (a?.user_id) email = (await supabaseAdmin.auth.admin.getUserById(a.user_id)).data.user?.email ?? null;
  return { email, phone: a?.notify_phone ?? null, name: a?.stage_name ?? "Artist" };
}

export function siteOrigin(req: Request | undefined) {
  try { return req ? new URL(req.url).origin : ""; } catch { return ""; }
}
