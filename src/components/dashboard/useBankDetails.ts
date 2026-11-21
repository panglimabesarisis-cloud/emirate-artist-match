import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BankDetails = { bank_name: string; account_holder: string; iban: string };

/**
 * Reads the locked bank record. The `artist_bank_details` table is created by a
 * database migration; until it exists the query resolves to null so the UI
 * falls back to manual entry instead of failing.
 */
export function useBankDetails(artistId: string) {
  return useQuery({
    queryKey: ["bank-details", artistId],
    queryFn: async (): Promise<BankDetails | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (supabase as any).from("artist_bank_details").select("bank_name, account_holder, iban").eq("artist_id", artistId).maybeSingle();
      if (res.error || !res.data) return null;
      return res.data as BankDetails;
    },
  });
}

export function maskIban(iban: string) {
  const c = iban.replace(/\s+/g, "");
  return c.length <= 8 ? c : `${c.slice(0, 4)} •••• •••• ${c.slice(-4)}`;
}
