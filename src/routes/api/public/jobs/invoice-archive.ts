import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Called on a schedule: archives issued and paid invoices to Google Drive. */
export const Route = createFileRoute("/api/public/jobs/invoice-archive")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const failure = await authenticateCronRequest(request);
        if (failure) return failure;
        const { runInvoiceArchive } = await import("@/lib/invoice-archive.server");
        return Response.json({ ok: true, ...(await runInvoiceArchive()) });
      },
    },
  },
});
