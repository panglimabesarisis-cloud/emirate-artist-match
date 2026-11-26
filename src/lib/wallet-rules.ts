/** A booking's share in the artist wallet, matching `artist_wallet()` (0099) and the ledger. */
export type WalletState = "awaiting" | "escrow" | "review" | "ready";
export type WalletBooking = { retained_to?: string | null; status: string; escrow_status: string; amount: number | string; vat_amount: number | string; total: number | string; paid_amount: number | string; refund_amount: number | string | null };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Released means a completed job whose escrow has ended; everything else paid is still held. */
export function walletShare(b: WalletBooking, rate: number): { state: WalletState; gross: number; fee: number; net: number } {
  const total = Number(b.total), paid = Number(b.paid_amount);
  const state: WalletState = !(total > 0 && paid > 0) ? "awaiting"
    : b.status === "completed" && (b.escrow_status === "released" || b.escrow_status === "partially_refunded") ? "ready"
    : b.status === "cancelled" && b.retained_to === "artist" ? "ready"
    : b.status === "completed" && b.escrow_status === "release_pending" ? "review" : "escrow";
  const collected = Math.max(0, Math.min(total, paid - Number(b.refund_amount ?? 0)));
  // An unpaid job shows what it would earn; otherwise only collected money counts, less its VAT.
  const gross = state === "awaiting" ? Number(b.amount) : r2(collected - r2((collected * Number(b.vat_amount)) / total));
  const fee = r2((gross * rate) / 100);
  return { state, gross, fee, net: r2(gross - fee) };
}
