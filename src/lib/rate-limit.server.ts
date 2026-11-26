/** Limits on work that costs money, counted by the database (`hit_rate_limit`, 0099). */
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

/** New chats one signed-in client may open. */
export const newChatLimits = (userId: string): Limit[] => [[`chat-hour:${userId}`, 5, "1 hour"], [`chat-day:${userId}`, 15, "1 day"]];
/** Messages one signed-in client may send across all their chats. */
export const clientMessageLimits = (userId: string): Limit[] => [[`message-hour:${userId}`, 60, "1 hour"]];
/** Questions to the public concierge: per visitor first, so one visitor cannot use up everyone's share. */
export const conciergeLimits = (address: string): Limit[] => [[`concierge:${address}`, 20, "1 hour"], ["concierge-all", 500, "1 hour"]];
