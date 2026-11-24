import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ArtistPerformance = {
  from: string; to: string; days: number;
  artists: { id: string; name: string }[];
  summary: { bookings: number; averageBookingValue: number; completionRate: number | null; completedJobs: number; aiShare: number | null };
  statistics: { incoming: number; invoiceSent: number; unpaidInvoice: number; aiReply: number; artistReply: number; clientReply: number };
  rankingTotal: number;
  ranking: { id: string; name: string; plan: string; completed: number; booking_value: number; rating: number | null; incoming: number }[];
  series: { id: string; name: string }[];
  daily: { date: string; total: number; artists: Record<string, number> }[];
};

export const getArtistPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days: number; artistId: string | null; page: number }) => {
    if (![30, 90, 180, 365].includes(input.days) || !Number.isInteger(input.page) || input.page < 0 || input.page > 100000 || (input.artistId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.artistId))) throw new Error("Invalid analytics filters");
    return input;
  })
  .handler(async ({ data: filters, context }) => {
    const { data, error } = await context.supabase.rpc("admin_performance_analytics", { _days: filters.days, _page: filters.page, ...(filters.artistId ? { _artist_id: filters.artistId } : {}) });
    if (error) throw new Error("Unable to load artist performance");
    return data as unknown as ArtistPerformance;
  });