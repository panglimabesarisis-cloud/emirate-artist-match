import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminAllocation } from "./admin-finance-rules";
import type { Json } from "@/integrations/supabase/types";

export type AdminSnapshot = {
  collected: number; refunded: number; held: number; bookings: number; activeArtists: number;
  pendingArtists: number; pendingVerification: number; pendingArtistPayouts: number; pendingClientPayouts: number;
  months: { m: string; bookings: number; revenue: number; quotes: number }[];
  statuses: { name: string; value: number }[]; categories: { name: string; value: number }[]; plans: { name: string; value: number }[];
};
export type AdminFinanceRow = {
  id: string; artist_id: string; client_name: string; package_title: string | null; event_date: string; amount: number; total: number;
  vat_amount: number; paid_amount: number; refund_amount: number; status: string; escrow_status: string;
  invoice_no: string | null; commission_rate: number | null; commission_basis: string | null;
  client_email: string | null; invoice_items: Json; notes: string | null; paid_at: string | null; created_at: string;
  client_commission_pct: number | null; artist_name: string; eligible_value: number | null;
  client_commission: number | null; client_commission_status: string | null;
};

export const getAdminSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_control_snapshot");
    if (error) throw new Error("Unable to load admin summary");
    return data as unknown as AdminSnapshot;
  });

export const getAdminFinance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { page: number; search: string; status: string; paidOnly?: boolean | undefined }) => {
    if (!Number.isInteger(input.page) || input.page < 0 || input.page > 100000 || input.search.length > 120) throw new Error("Invalid filters");
    return { page: input.page, search: input.search.trim(), status: input.status, paidOnly: input.paidOnly === true };
  })
  .handler(async ({ data: filters, context }) => {
    const { data, error } = await context.supabase.rpc("admin_finance_page", { _page: filters.page, _search: filters.search, _status: filters.status, _paid_only: filters.paidOnly });
    if (error) throw new Error("Unable to load booking allocations");
    const page = data as unknown as { total: number; rows: AdminFinanceRow[] };
    return { total: page.total, rows: page.rows.map((row) => {
      const reversed = row.status === "cancelled" || row.escrow_status === "refunded";
      // Existing client RPC owns refund eligibility; unpaid bookings have no client reward yet.
      const eligible = row.eligible_value ?? (row.total > 0 ? Math.round(row.amount * Math.max(0, 1 - row.refund_amount / row.total) * 100) / 100 : row.amount);
      return { ...row, allocation: adminAllocation(eligible, row.commission_rate, row.client_commission ?? 0, reversed) };
    }) };
  });