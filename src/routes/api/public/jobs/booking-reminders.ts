import {createFileRoute} from '@tanstack/react-router';
import {authenticateCronRequest} from '@/integrations/supabase/cron-auth';
export const Route=createFileRoute('/api/public/jobs/booking-reminders')({server:{handlers:{POST:async({request})=>{
 const failure=await authenticateCronRequest(request);if(failure)return failure;
 const {runBookingJobs}=await import('@/lib/booking-jobs.server');
 await runBookingJobs(new URL(request.url).origin);return Response.json({ok:true});
}}}});
