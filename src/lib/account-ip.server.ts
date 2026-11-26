import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** The caller's address as the edge saw it: Cloudflare's header first, then the first proxy hop. */
export function requestIp() {
  const headers = getRequest()?.headers;
  const raw = headers?.get("cf-connecting-ip") ?? headers?.get("x-forwarded-for")?.split(",")[0];
  const ip = raw?.trim();
  // Only the characters an IPv4 or IPv6 literal can hold, so a spoofed header cannot reach the inet column as junk.
  return ip && ip.length <= 45 && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null;
}

/**
 * Records where an account registered from, and where it last acted. Admins read this when a
 * booking looks like an artist booking themselves; it is never shown on a public profile, and
 * only the server writes it (profiles.guard_profile_ip refuses a write from the account itself).
 *
 * Never throws: a missing address must not stop someone finishing their registration.
 */
export async function recordAccountIp(userId: string) {
  const ip = requestIp();
  if (!ip) return;
  const { error } = await supabaseAdmin.rpc("record_account_ip", { _user: userId, _ip: ip });
  if (error) console.error("Could not record the account address", { code: error.code });
}
