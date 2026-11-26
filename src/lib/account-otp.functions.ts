import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requestAccountCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { phone?: string }) => z.object({ phone: z.string().max(32).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const server = await import("./account-otp.server");
    return server.requestAccountCode(context.userId, data.phone);
  });

export const confirmAccountCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; code: string }) => z.object({ id: z.string().uuid(), code: z.string().regex(/^\d{6}$/) }).parse(data))
  .handler(async ({ data, context }) => {
    const server = await import("./account-otp.server");
    return server.confirmAccountCode(context.userId, data.id, data.code);
  });

const text = z.string().max(120);
export const saveBankDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ account_type: text, holder_name: text, bank_name: text, branch: text, iban: text, swift: text }).parse(data))
  .handler(async ({ data, context }) => {
    const server = await import("./account-otp.server");
    return server.saveBank(context.userId, data);
  });
