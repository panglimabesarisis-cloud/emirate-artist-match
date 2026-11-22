/**
 * Where a booking is in its life, shown the same way in Calendar, Overview and the private AI agent:
 * - Soft Booking: from a form or the AI agent, nothing paid yet (grey).
 * - Job Booking: the client paid a down payment (gold at 40%) or paid in full (gold). It stays a Job Booking until the money is in the wallet.
 * - Job Complete: the job is done and the escrow was released to the wallet (green).
 */
export type BookingStage = "soft" | "job" | "complete";
export type BookingPay = "unpaid" | "partial" | "paid";

type StageInput = { status: string; total: number | string; paid_amount: number | string; escrow_status?: string | null };

export function bookingPay(b: Pick<StageInput, "total" | "paid_amount">): BookingPay {
  const total = Number(b.total), paid = Number(b.paid_amount);
  return paid > 0 && paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
}

export function bookingStage(b: StageInput): BookingStage {
  if (b.status === "completed" && b.escrow_status === "released") return "complete";
  if (b.status !== "cancelled" && Number(b.paid_amount) > 0) return "job";
  return "soft";
}

export const STAGE_LABEL: Record<BookingStage, string> = { soft: "Soft Booking", job: "Job Booking", complete: "Job Complete" };
export const STAGE_COLOR: Record<BookingStage, string> = { soft: "#9aa0ab", job: "#e8b04a", complete: "#7bd88f" };

/** Tailwind classes for a small status chip / calendar entry, by stage and payment. */
export function stageClasses(b: StageInput): { chip: string; entry: string } {
  const stage = bookingStage(b);
  if (stage === "complete") return { chip: "border-transparent bg-emerald-400/25 text-emerald-200", entry: "border-emerald-400 bg-emerald-400/15 hover:bg-emerald-400/25" };
  if (stage === "job") {
    return bookingPay(b) === "paid"
      ? { chip: "border-transparent bg-gradient-gold text-gold-foreground", entry: "border-gold bg-gold/70 hover:bg-gold/80" }
      : { chip: "border-transparent bg-gold/40 text-white", entry: "border-gold bg-gold/40 hover:bg-gold/50" };
  }
  return { chip: "border-transparent bg-zinc-400/25 text-zinc-200", entry: "border-zinc-400 bg-zinc-400/15 hover:bg-zinc-400/25" };
}
