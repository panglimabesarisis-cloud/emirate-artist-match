/** Read-only agreement allocation. Never a settlement or wallet balance. */
export function adminAllocation(eligible: number, artistRate: number | null, clientCommission: number, reversed = false) {
  const value = reversed ? 0 : Math.max(0, eligible);
  const client = reversed ? 0 : Math.max(0, clientCommission);
  if (artistRate === null) return { artist: null, fee: null, client, retained: null, shortfall: null };
  const fee = Math.round(value * artistRate) / 100;
  const artist = Math.round((value - fee) * 100) / 100;
  return { artist, fee, client, retained: Math.round((fee - client) * 100) / 100, shortfall: Math.max(0, Math.round((client - fee) * 100) / 100) };
}