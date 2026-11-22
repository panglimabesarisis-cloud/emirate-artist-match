import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route = createFileRoute('/api/public/jobs/verification-retention')({
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request);
    if (failure) return failure;
    const { runVerificationRetention } = await import('@/lib/verification.server');
    const result = await runVerificationRetention();
    return Response.json({ ok: result.failed === 0, ...result }, { status: result.failed ? 503 : 200 });
  } } },
});
