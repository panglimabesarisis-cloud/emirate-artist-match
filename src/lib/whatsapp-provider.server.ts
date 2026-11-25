import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { internationalPhone, whatsappProvider, type WhatsAppSendResult } from "./whatsapp-provider";

export const WHATSAPP_TEMPLATE = "dealmaker_booking_update";

export async function readWhatsAppConfig() {
  const { data, error } = await supabaseAdmin.from("admin_secrets").select("key,value").in("key", ["whatsapp_provider", "fonnte_token"]);
  if (error) throw new Error("Unable to load WhatsApp settings");
  return {
    provider: whatsappProvider(data?.find((r) => r.key === "whatsapp_provider")?.value),
    token: data?.find((r) => r.key === "fonnte_token")?.value ?? "",
  };
}

export async function sendWhatsApp(phone: string, headline: string, details: string, link: string, footer?: string): Promise<WhatsAppSendResult> {
  const to = internationalPhone(phone);
  const config = await readWhatsAppConfig();
  if (config.provider === "fonnte") {
    if (!config.token) return { status: "pending_setup", error: "Fonnte token is not configured" };
    const body = new FormData();
    body.set("target", to);
    body.set("countryCode", "0");
    body.set("connectOnly", "true");
    body.set("message", [headline, details, link, footer].filter(Boolean).join("\n\n"));
    try {
      const response = await fetch("https://api.fonnte.com/send", {
        method: "POST", headers: { Authorization: config.token }, body,
        redirect: "manual", signal: AbortSignal.timeout(15000),
      });
      // Do not expose provider bodies: they may echo credentials or private link keys.
      if (!response.ok) return { status: "failed", error: `Fonnte request failed (HTTP ${response.status}); check token, device connection and balance` };
      const result = await response.json() as { status?: boolean; id?: unknown[] };
      if (result.status !== true) return { status: "failed", error: "Fonnte rejected the request; check token, device connection and balance" };
      const id = result.id?.[0];
      if (typeof id !== "string" && typeof id !== "number") return { status: "failed", error: "Fonnte returned no message reference; delivery is unverified" };
      return { status: "accepted", messageId: `fonnte:${id}` };
    } catch { return { status: "failed", error: "Fonnte response unavailable; delivery is unverified. Check Fonnte before retrying" }; }
  }
  const lk = process.env["LOVABLE_API_KEY"], wk = process.env["WHATSAPP_API_KEY"];
  if (!lk || !wk) return { status: "pending_setup" };
  const response = await fetch("https://connector-gateway.lovable.dev/whatsapp/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": wk, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: { name: WHATSAPP_TEMPLATE, language: { code: "en_US" }, components: [{ type: "body", parameters: [headline, details, [link, footer].filter(Boolean).join("\n")].map((t) => ({ type: "text", text: t.replace(/\s*\n+\s*/g, " · ").slice(0, 900) })) }] },
    }),
  });
  if (!response.ok) return { status: "failed", error: `Meta request failed (HTTP ${response.status}); check connection and approved template` };
  const result = await response.json() as { messages?: { id?: string }[] };
  const messageId = result.messages?.[0]?.id;
  return messageId ? { status: "accepted", messageId } : { status: "failed", error: "Meta returned no message reference" };
}