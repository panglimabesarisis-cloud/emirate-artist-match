import { VAT_RATE, priceBreakdown } from './booking-rules';

/** Booking deposits are percentages of the VAT-inclusive total, in integer fils. */
export function bookingPayment(amount: number, paid: number, depositPct: number, isVatInclusive = true) {
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const totalMinor = Math.round((isVatInclusive ? safeAmount : priceBreakdown(safeAmount).total) * 100);
  const subtotalMinor = isVatInclusive ? Math.round(totalMinor / (1 + VAT_RATE)) : Math.round(safeAmount * 100);
  const paidMinor = Number.isFinite(paid) && paid > 0 ? Math.round(paid * 100) : 0;
  const deposit = Number.isFinite(depositPct) && depositPct > 0 ? Math.min(100, depositPct) : 100;
  const balanceMinor = Math.max(0, totalMinor - paidMinor);
  const dueMinor = paidMinor > 0 ? balanceMinor : Math.round(totalMinor * deposit / 100);
  return { subtotal: subtotalMinor / 100, vatAmount: (totalMinor - subtotalMinor) / 100, total: totalMinor / 100, dueMinor, dueAmount: dueMinor / 100, balance: balanceMinor / 100, percent: totalMinor > 0 ? Math.min(100, Math.round(paidMinor / totalMinor * 100)) : 0 };
}

export function canCheckoutBooking(invoiceNo: string | null, dueMinor: number) {
  return Boolean(invoiceNo?.trim()) && Number.isSafeInteger(dueMinor) && dueMinor > 0;
}
export function reminderDue(date: string, status: string, total: number, paid: number, now = new Date()) {
  const today = new Date(now.getTime() + 4 * 3600000).toISOString().slice(0, 10);
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return status === 'confirmed' && paid > 0 && paid < total && days === 7;
}
