/** Email through Resend. The key lives in admin-only `admin_secrets` and never reaches a browser. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type EmailResult = { status: "sent" | "failed" | "pending_setup"; error?: string };

export async function readEmailConfig() {
  const { data } = await supabaseAdmin.from("admin_secrets").select("key, value").in("key", ["resend_api_key", "email_from"]);
  const value = (key: string) => data?.find?.((row) => row.key === key)?.value ?? "";
  return { apiKey: value("resend_api_key"), from: value("email_from") };
}

/** Never throws: a message that cannot be sent is reported, so the booking step that triggered it still finishes. */
export async function sendEmail(to: string, subject: string, text: string): Promise<EmailResult> {
  try {
    const { apiKey, from } = await readEmailConfig();
    if (!apiKey || !from) return { status: "pending_setup" };
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: subject.slice(0, 200), text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return { status: "sent" };
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    return { status: "failed", error: `Email provider answered ${response.status}${typeof body?.message === "string" ? `: ${body.message.slice(0, 200)}` : ""}` };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message.slice(0, 200) : "Email could not be sent" };
  }
}
