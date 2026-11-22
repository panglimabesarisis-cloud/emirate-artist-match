import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

/** Explicit admin import of uploaded reference content, not a page-load seed. */
export const importReferenceContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || role.data !== true) throw new Error("Admin access required");
    // Kept inside the handler: restricted clauses must never ship in browser bundles.
    const { default: referenceContracts } = await import("./reference-contracts.json");
    const [existing, tiers] = await Promise.all([
      context.supabase.from("contract_templates").select("name").is("artist_id", null),
      context.supabase.from("plan_tiers").select("code"),
    ]);
    if (existing.error) throw existing.error;
    if (tiers.error) throw tiers.error;
    const names = new Set(existing.data.map((row) => row.name.trim().toLowerCase()));
    const rows = referenceContracts.filter((row) => !names.has(row.name.trim().toLowerCase()));
    if (rows.some((row) => !tiers.data.some((tier) => tier.code === row.tier))) throw new Error("Reference template plans do not match configured plans");
    if (!rows.length) return { imported: 0 };
    const result = await context.supabase.from("contract_templates").insert(rows.map((row) => ({
      ...row, clauses: row.clauses as unknown as Json, artist_id: null, price_aed: 0, is_active: false,
    })));
    if (result.error) throw result.error;
    return { imported: rows.length };
  });