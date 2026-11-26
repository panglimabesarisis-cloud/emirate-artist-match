import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CANCEL_REASON } from "./cancellation-rules";

type Decision = { id: string; approve: boolean; refund: number; retainedTo: "artist" | "platform" | null; note: string };

function validate(i: Decision): Decision {
  if (typeof i.id !== "string" || !/^[0-9a-f-]{36}$/i.test(i.id)) throw new Error("Invalid id");
  const note = String(i.note ?? "").trim().slice(0, CANCEL_REASON.max);
  if (note.length < CANCEL_REASON.min) throw new Error("Explain the decision in at least 20 characters");
  const refund = Math.round(Number(i.refund ?? 0) * 100) / 100;
  if (!Number.isFinite(refund) || refund < 0) throw new Error("Invalid refund amount");
  return { id: i.id, approve: i.approve === true, refund, retainedTo: i.retainedTo === "artist" || i.retainedTo === "platform" ? i.retainedTo : null, note };
}

/**
 * Admin: approve or reject a cancellation request. On approval the request is claimed first, then the money is
 * refunded, then the decision is recorded; a failed refund hands the request back. The database checks the
 * finance permission on every step.
 */
export const decideCancellation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const finish = async (recorded: boolean) => {
      const { error } = await db.rpc("finish_cancellation", { _id: data.id, _approve: data.approve, _refund: data.refund, _retained_to: data.retainedTo as string, _note: data.note, _recorded: recorded });
      if (error) throw new Error(error.message);
    };
    if (!data.approve) { await finish(false); return { ok: true }; }
    const claim = await db.rpc("claim_cancellation", { _id: data.id });
    if (claim.error) throw new Error(claim.error.message);
    const { booking_id: bookingId, paid } = claim.data as { booking_id: string; paid: number };
    const release = () => db.rpc("release_cancellation", { _id: data.id });
    if (data.refund > Number(paid) || (data.refund < Number(paid) && !data.retainedTo)) {
      await release();
      throw new Error(data.refund > Number(paid) ? "The refund is more than the amount paid" : "Choose who keeps the rest");
    }
    let refunded = false;
    if (data.refund > 0) {
      try {
        const { refundBookingTest } = await import("./refunds.server");
        refunded = await refundBookingTest(bookingId, data.refund);
      } catch (error) {
        await release();
        const { getStripeErrorMessage } = await import("./stripe.server");
        throw new Error(getStripeErrorMessage(error));
      }
    }
    await finish(refunded);
    return { ok: true };
  });
