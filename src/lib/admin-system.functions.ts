/** Admin → System settings: Email, API & webhooks, and Security. Secrets are only ever reported as present or not. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { limitProblem, parseLimits, type SecurityLimits } from "./security-limits";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireAdmin(supabase: any, action: "read" | "edit") {
  const { data, error } = await supabase.rpc("admin_can", { _module: "settings", _action: action });
  if (error || data !== true) throw new Error("You do not have permission for this");
}

export const getEmailSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, "read");
    const { readEmailConfig } = await import("./email-provider.server");
    const config = await readEmailConfig();
    return { from: config.from, keySaved: !!config.apiKey };
  });

const sender = /^(?:[^<>@\n]{1,80}<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/;

export const saveEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    from: z.string().trim().max(200).regex(sender, "Use an address, or Name <address>"),
    apiKey: z.string().trim().max(200).regex(/^re_[A-Za-z0-9_]+$/, "A Resend key starts with re_").optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, "edit");
    const now = new Date().toISOString();
    const rows = [{ key: "email_from", value: data.from, updated_at: now }, ...(data.apiKey ? [{ key: "resend_api_key", value: data.apiKey, updated_at: now }] : [])];
    const { error } = await context.supabase.from("admin_secrets").upsert(rows);
    if (error) throw new Error("Unable to save email settings");
    return { ok: true };
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, "edit");
    // The test goes to the admin's own account address, so it can never contact someone who did not ask.
    const { data } = await context.supabase.auth.getUser();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.user?.email ?? (await supabaseAdmin.auth.admin.getUserById(context.userId)).data.user?.email;
    if (!email) throw new Error("Your account has no email address");
    const { sendEmail } = await import("./email-provider.server");
    return { ...(await sendEmail(email, "Dealmaker test email", "Email from Dealmaker is working.")), to: email };
  });

export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, "read");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [secrets, payments, whatsapp, jobs] = await Promise.all([
      supabaseAdmin.from("admin_secrets").select("key").neq("value", ""),
      supabaseAdmin.from("payment_event_inbox").select("status, created_at").order("created_at", { ascending: false }).limit(200),
      supabaseAdmin.from("whatsapp_webhook_events").select("id", { count: "exact", head: true }),
      context.supabase.rpc("admin_scheduled_jobs"),
    ]);
    const saved = new Set((secrets.data ?? []).map((r) => r.key));
    const env = (name: string) => !!process.env[name];
    return {
      keys: [
        { name: "AI gateway (Lovable)", set: env("LOVABLE_API_KEY"), where: "Server" },
        { name: "Google Gemini backup", set: saved.has("google_api_key"), where: "Settings → AI agent" },
        { name: "Stripe secret key", set: env("STRIPE_SECRET_KEY") || env("STRIPE_SANDBOX_API_KEY"), where: "Server" },
        { name: "Stripe webhook secret", set: env("STRIPE_WEBHOOK_SECRET") || env("PAYMENTS_SANDBOX_WEBHOOK_SECRET"), where: "Server" },
        { name: "WhatsApp (Fonnte) token", set: saved.has("fonnte_token"), where: "Settings → WhatsApp" },
        { name: "WhatsApp reply webhook secret", set: env("FONNTE_WEBHOOK_SECRET"), where: "Server" },
        { name: "Email (Resend) key", set: saved.has("resend_api_key"), where: "Settings → Email" },
        { name: "Scheduled jobs secret", set: env("LOVABLE_CRON_SECRET"), where: "Server" },
      ],
      payments: { total: payments.data?.length ?? 0, failed: (payments.data ?? []).filter((e) => e.status === "failed").length, last: payments.data?.[0]?.created_at ?? null },
      whatsappEvents: whatsapp.count ?? 0,
      jobs: (jobs.data ?? []) as { name: string; schedule: string; active: boolean; last_status: string | null; last_run: string | null }[],
    };
  });

export const getSecurityLimits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, "read");
    const { data } = await context.supabase.from("admin_secrets").select("value").eq("key", "security_limits").maybeSingle();
    return parseLimits(data?.value);
  });

export const saveSecurityLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SecurityLimits) => { const problem = limitProblem(input); if (problem) throw new Error(problem); return parseLimits(input); })
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, "edit");
    const { error } = await context.supabase.from("admin_secrets").upsert({ key: "security_limits", value: JSON.stringify(data), updated_at: new Date().toISOString() });
    if (error) throw new Error("Unable to save the limits");
    return { ok: true };
  });
