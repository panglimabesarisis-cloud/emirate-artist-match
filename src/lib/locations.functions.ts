import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cleanLocationName, locationSlug, sameLocation } from "./location-name";

/**
 * Lets a signed-in talent add a missing emirate or base area. The tables stay admin-only in the database;
 * this checks the role and the name first, and returns the existing row instead of making a duplicate.
 */
export const addLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; emirateId?: string | null }) => {
    const emirateId = input.emirateId ?? null;
    if (emirateId !== null && !/^[0-9a-f-]{36}$/i.test(emirateId)) throw new Error("Invalid emirate");
    return { name: cleanLocationName(input.name), emirateId };
  })
  .handler(async ({ data, context }) => {
    const roles = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (roles.error || !roles.data?.some((row: { role: string }) => row.role === "artist" || row.role === "admin")) throw new Error("Only talent accounts can add places.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    if (data.emirateId) {
      const existing = await db.from("areas").select("id,name,slug").eq("emirate_id", data.emirateId);
      if (existing.error) throw new Error("Could not load areas.");
      const match = existing.data.find((row) => sameLocation(row.name, data.name));
      if (match) return { id: match.id, name: match.name };
      if (existing.data.length >= 500) throw new Error("This emirate cannot take more areas. Contact support.");
      const made = await db.from("areas").insert({ emirate_id: data.emirateId, name: data.name, slug: locationSlug(data.name, existing.data.map((row) => row.slug)) }).select("id,name").single();
      if (made.error) throw new Error("Could not add the area.");
      return made.data;
    }
    const existing = await db.from("emirates").select("id,name,slug,sort");
    if (existing.error) throw new Error("Could not load emirates.");
    const match = existing.data.find((row) => sameLocation(row.name, data.name));
    if (match) return { id: match.id, name: match.name };
    if (existing.data.length >= 60) throw new Error("No more emirates can be added. Contact support.");
    const sort = Math.max(0, ...existing.data.map((row) => row.sort ?? 0)) + 1;
    const made = await db.from("emirates").insert({ name: data.name, slug: locationSlug(data.name, existing.data.map((row) => row.slug)), sort }).select("id,name").single();
    if (made.error) throw new Error("Could not add the emirate.");
    return made.data;
  });
