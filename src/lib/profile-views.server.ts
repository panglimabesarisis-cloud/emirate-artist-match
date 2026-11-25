import { createHmac } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** One view per visitor, profile and day. Only a keyed hash is stored, never the address or browser. */
export async function saveProfileView(slug: string, visitor: { ip: string; agent: string }, now = new Date()) {
  if (!visitor.ip && !visitor.agent) return;
  if (/bot|crawl|spider|slurp|preview|headless/i.test(visitor.agent)) return;
  const { data: artist } = await supabaseAdmin.from("artists").select("id").eq("slug", slug).eq("status", "approved").maybeSingle();
  if (!artist) return;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  // The date is part of the hash, so one visitor cannot be followed from day to day.
  const key = createHmac("sha256", process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "dealmaker").update(`${artist.id}|${day}|${visitor.ip}|${visitor.agent}`).digest("hex");
  await supabaseAdmin.from("artist_profile_views").upsert({ artist_id: artist.id, day, visitor: key }, { onConflict: "artist_id,day,visitor", ignoreDuplicates: true });
}
