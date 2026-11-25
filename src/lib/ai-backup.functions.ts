import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Master admin: asks Google for a one-word reply with the saved key. */
export const testGoogleBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error } = await context.supabase.rpc("admin_can", { _module: "settings", _action: "edit" });
    if (error || !admin) throw new Error("Admin access required");
    const { geminiResponse, readGoogleBackup } = await import("./ai-provider.server");
    const backup = await readGoogleBackup();
    if (!backup) return { ok: false as const, message: "Save a Google API key first." };
    try {
      await geminiResponse({ input: "Reply with the single word OK.", max_output_tokens: 50 }, backup);
      return { ok: true as const, message: `Google replied with ${backup.model}.` };
    } catch (failure) {
      return { ok: false as const, message: failure instanceof Error ? failure.message : "Google did not reply." };
    }
  });
