import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { internationalPhone, requireWhatsAppAdmin } from "./whatsapp-provider";

export const getWhatsAppSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error) throw new Error("Unable to verify admin access");
    requireWhatsAppAdmin(data);
    const { readWhatsAppConfig } = await import("./whatsapp-provider.server");
    const config = await readWhatsAppConfig();
    return { provider: config.provider, tokenConfigured: Boolean(config.token) };
  });

export const saveWhatsAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ provider: z.enum(["meta", "fonnte"]), token: z.string().trim().max(4096).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error) throw new Error("Unable to verify admin access");
    requireWhatsAppAdmin(admin);
    const { readWhatsAppConfig } = await import("./whatsapp-provider.server");
    const config = await readWhatsAppConfig();
    if (data.provider === "fonnte" && !data.token && !config.token) throw new Error("Enter a Fonnte token before selecting Fonnte");
    const rows: { key: string; value: string; updated_at: string }[] = [{ key: "whatsapp_provider", value: data.provider, updated_at: new Date().toISOString() }];
    if (data.token) rows.push({ key: "fonnte_token", value: data.token, updated_at: new Date().toISOString() });
    const { error: writeError } = await context.supabase.from("admin_secrets").upsert(rows);
    if (writeError) throw new Error("Unable to save WhatsApp settings");
    return { ok: true };
  });

export const testWhatsAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ phone: z.string().max(32).transform(internationalPhone) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error) throw new Error("Unable to verify admin access");
    requireWhatsAppAdmin(admin);
    const { sendWhatsApp } = await import("./whatsapp-provider.server");
    const result = await sendWhatsApp(data.phone, "Dealmaker WhatsApp test", "This is a test notification from Dealmaker admin settings.", "https://dealmakertalent.com");
    return { status: result.status, error: result.error };
  });