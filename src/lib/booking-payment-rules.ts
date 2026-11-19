/** Booking deposits are percentages of the VAT-inclusive total. */
export function bookingPayment(total: number, paid: number, depositPct: number) {
  const totalMinor = Math.round(total * 100), paidMinor = Math.round(paid * 100);
  const balanceMinor = Math.max(0, totalMinor - paidMinor);
  const dueMinor = paidMinor > 0 ? balanceMinor : Math.round(totalMinor * depositPct / 100);
  return { dueMinor, balance: balanceMinor / 100, percent: totalMinor > 0 ? Math.min(100, Math.round(paidMinor / totalMinor * 100)) : 0 };
}
export function reminderDue(date: string, status: string, total: number, paid: number, now = new Date()) {
  const today = new Date(now.getTime() + 4 * 3600000).toISOString().slice(0, 10);
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return status === 'confirmed' && paid > 0 && paid < total && days === 7;
}
