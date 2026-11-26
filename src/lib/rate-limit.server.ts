/** Limits on work that costs money, counted by the database (`hit_rate_limit`, 0099). */
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_LIMITS, parseLimits, type SecurityLimits } from "./security-limits";

export type Limit = [bucket: string, max: number, window: "1 hour" | "1 day"];

/** True while every limit has room. Stops at the first full one; refuses when the counter cannot be read. */
export async function withinLimits(limits: Limit[]): Promise<boolean> {
  for (const [bucket, max, window] of limits) {
    const { data, error } = await supabaseAdmin.rpc("hit_rate_limit", { _bucket: bucket, _max: max, _window: window });
    if (error) console.error("Rate limit unavailable", error.message);
    if (data !== true) return false;
  }
  return true;
}

/** The visitor's network address as the hosting edge reports it. */
export function clientAddress(): string {
  const headers = getRequest()?.headers;
  return (headers?.get("cf-connecting-ip") || headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown").slice(0, 64);
}

/** The limits saved in Settings → Security, or the defaults when none can be read. */
export async function readLimits(): Promise<SecurityLimits> {
  try {
    const { data } = await supabaseAdmin.from("admin_secrets").select("value").eq("key", "security_limits").maybeSingle();
    return parseLimits(data?.value);
  } catch { return DEFAULT_LIMITS; }
}

/** New chats one signed-in client may open. */
export const newChatLimits = (userId: string, l: SecurityLimits = DEFAULT_LIMITS): Limit[] => [[`chat-hour:${userId}`, l.chatsPerHour, "1 hour"], [`chat-day:${userId}`, l.chatsPerDay, "1 day"]];
/** Messages one signed-in client may send across all their chats. */
export const clientMessageLimits = (userId: string, l: SecurityLimits = DEFAULT_LIMITS): Limit[] => [[`message-hour:${userId}`, l.messagesPerHour, "1 hour"]];
/** Questions to the public concierge: per visitor first, so one visitor cannot use up everyone's share. */
export const conciergeLimits = (address: string, l: SecurityLimits = DEFAULT_LIMITS): Limit[] => [[`concierge:${address}`, l.conciergePerVisitor, "1 hour"], ["concierge-all", l.conciergeTotal, "1 hour"]];
