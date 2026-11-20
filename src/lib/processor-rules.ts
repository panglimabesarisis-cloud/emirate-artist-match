export const AED_TO_IDR = 4900;
/** Both AED and Stripe IDR charges use two-decimal minor units. */
export function testProcessorAmount(aedFils: number) {
  if (!Number.isSafeInteger(aedFils) || aedFils <= 0) throw new Error('Invalid AED amount');
  const amount = Math.round(aedFils * AED_TO_IDR);
  if (!Number.isSafeInteger(amount)) throw new Error('Payment amount is too large');
  return amount;
}
export function refundEscrowStatus(paid: number, refund: number) {
  return paid <= 0 ? 'none' : refund <= 0 ? 'held' : refund >= paid ? 'refunded' : 'partially_refunded';
}