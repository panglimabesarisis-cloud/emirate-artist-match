import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BankDetails = {
  account_type: string;
  holder_name: string | null;
  bank_name: string | null;
  branch: string | null;
  iban: string | null;
  swift: string | null;
  updated_at: string;
};

/** Withdrawals are refused for this long after the bank record last changed (enforced in the database). */
export const BANK_HOLD_DAYS = 3;
export const BANK_HOLD_HOURS = BANK_HOLD_DAYS * 24;

/** Reads the artist's saved bank record. Only the artist owner can read it (RLS). */
export function useBankDetails(artistId: string) {
  return useQuery({
    queryKey: ["bank-details", artistId],
    enabled: !!artistId,
    queryFn: async (): Promise<BankDetails | null> => {
      const res = await supabase
        .from("artist_bank_details")
        .select("account_type, holder_name, bank_name, branch, iban, swift, updated_at")
        .eq("artist_id", artistId)
        .maybeSingle();
      if (res.error || !res.data) return null;
      return res.data as BankDetails;
    },
  });
}

/** Hours left before a withdrawal is allowed again, or 0 when the hold is over. */
export function holdHoursLeft(updatedAt: string | undefined, now = Date.now()): number {
  if (!updatedAt) return 0;
  const left = BANK_HOLD_HOURS - (now - new Date(updatedAt).getTime()) / 3_600_000;
  return left > 0 ? Math.ceil(left) : 0;
}

export function maskIban(iban: string | null | undefined) {
  const c = (iban ?? "").replace(/\s+/g, "");
  return c.length <= 8 ? c : `${c.slice(0, 4)} •••• •••• ${c.slice(-4)}`;
}
