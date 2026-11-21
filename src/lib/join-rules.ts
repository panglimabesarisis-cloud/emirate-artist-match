/** Max specialties a talent can list during signup, per subscription plan. */
export const SPECIALTY_LIMITS: Record<string, number> = { free: 1, basic: 2, medium: 3, pro: 10 };
export const specialtyLimit = (plan: string) => SPECIALTY_LIMITS[plan] ?? 1;
/** Flat signup deposit (AED) charged for every plan, including Free. */
export const JOIN_DEPOSIT_AED = 100;
/** Signup payment: flat deposit plus 5% UAE VAT (AED). */
export function joinPaymentTotal(deposit: number = JOIN_DEPOSIT_AED) {
  const vat = Math.round(deposit * 0.05 * 100) / 100;
  return { subtotal: deposit, vat, total: Math.round((deposit + vat) * 100) / 100 };
}
