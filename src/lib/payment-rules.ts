/** Confirmed purchase policies; invoked by payment processing once checkout is connected. */
export function sandboxPaymentSettled(session: { livemode: boolean; status: string | null; payment_status: string; currency: string | null; amount_total: number | null }) {
  return session.livemode === false && session.status === "complete" && session.payment_status === "paid" && session.currency === "aed" && Number.isSafeInteger(session.amount_total) && Number(session.amount_total) > 0;
}

export function bookingPaymentEffects(paymentStatus: string) {
  const settled = paymentStatus === "paid";
  return {
    confirmBooking: settled,
    holdFunds: settled,
    notifyClient: settled,
    notifyArtist: settled,
    notifyManager: settled,
  };
}

export function subscriptionHasPaidBenefits(status: string, paidUntil: string, now = new Date()) {
  const end = Date.parse(paidUntil);
  return ["active", "trialing", "past_due", "canceled"].includes(status)
    && Number.isFinite(end) && end > now.getTime();
}

export function planChangePolicy(direction: "upgrade" | "downgrade") {
  return direction === "upgrade"
    ? { effective: "immediate", prorate: true } as const
    : { effective: "next_renewal", prorate: false } as const;
}