/** Max specialties a talent can list during signup, per subscription plan. */
export const SPECIALTY_LIMITS: Record<string, number> = { free: 1, medium: 3, pro: 10 };
export const specialtyLimit = (plan: string) => SPECIALTY_LIMITS[plan] ?? 1;
/** Signup payment for a plan: monthly price plus 5% UAE VAT (AED). */
export function joinPaymentTotal(monthly: number) {
  const vat = Math.round(monthly * 0.05 * 100) / 100;
  return { subtotal: monthly, vat, total: Math.round((monthly + vat) * 100) / 100 };
}
