import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const requestPhoneCode = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string }) => z.object({ phone: z.string().max(32) }).parse(data))
  .handler(async ({ data }) => {
    const { requestCode } = await import("./phone-otp.server");
    return requestCode(data.phone);
  });

export const confirmPhoneCode = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; code: string }) => z.object({ id: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).parse(data))
  .handler(async ({ data }) => {
    const { confirmCode } = await import("./phone-otp.server");
    const { optionalUserId } = await import("./request-user.server");
    return confirmCode(data.id, data.code, await optionalUserId());
  });

/** A number verified on this device before signing in is attached to the account. */
export const claimVerifiedPhone = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string; proof: string }) => z.object({ phone: z.string().max(32), proof: z.string().max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { proofMatches, markAccountPhone } = await import("./phone-otp.server");
    const { optionalUserId } = await import("./request-user.server");
    const userId = await optionalUserId();
    if (!userId || !(await proofMatches(data.phone, data.proof))) return { ok: false as const };
    await markAccountPhone(userId, data.phone);
    return { ok: true as const };
  });
