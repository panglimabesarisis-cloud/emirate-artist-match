import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Records an admin action that the server performs with its own key, which the database triggers cannot attribute.
 * A logging failure never undoes the action; it is reported to the server log.
 */
export async function recordAdminAction(userId: string, action: string, module: string, target: string | null, security: "low" | "medium" | "high" = "medium") {
  try {
    const request = getRequest();
    const headers = request?.headers;
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const { error } = await supabaseAdmin.from("admin_audit_log").insert({
      user_id: userId, email: data.user?.email ?? null, action, module, target, security,
      ip: (headers?.get("cf-connecting-ip") ?? headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "").slice(0, 64) || null,
      browser: headers?.get("user-agent")?.slice(0, 300) ?? null,
      url: headers?.get("referer")?.slice(0, 300) ?? (request ? new URL(request.url).pathname.slice(0, 300) : null),
    });
    if (error) console.error("admin action not recorded", error.message);
  } catch (error) { console.error("admin action not recorded", error instanceof Error ? error.message : error); }
}
