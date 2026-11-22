import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getClientBookingExtras, listClientConversations } from "@/lib/client-portal.functions";
import type { CommissionRow, PayoutRow } from "@/lib/client-portal-rules";

export const BOOKING_FIELDS = "id, access_key, status, escrow_status, invoice_no, package_title, event_date, start_time, end_time, amount, vat_amount, total, paid_amount, refund_amount, deposit_pct, notes, job_detail, guests, client_name, client_phone, conversation_id, created_at, paid_at, completed_at, cancelled_at, escrow_released_at, contract_accepted_at, client_confirmed_at, client_commission_pct, artist_id, artists(stage_name, slug, hue), event_types(name)";

const key = (uid: string, name: string) => ["cp", uid, name] as const;

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`Could not load ${what}`);
  return data;
}

/** Links earlier requests made with the verified email, once per session, then refreshes portal data. */
export function useClaimRecords(uid: string) {
  const qc = useQueryClient();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void supabase.rpc("claim_client_records").then(({ data }) => {
      const r = (data ?? {}) as Record<string, number>;
      if ((r["quotes"] ?? 0) + (r["bookings"] ?? 0) + (r["conversations"] ?? 0) > 0) void qc.invalidateQueries({ queryKey: ["cp", uid] });
    });
  }, [qc, uid]);
}

export function useClientBookings(uid: string) {
  return useQuery({
    queryKey: key(uid, "bookings"), refetchInterval: 30000,
    queryFn: () => must(supabase.from("bookings").select(BOOKING_FIELDS).eq("client_user_id", uid).order("created_at", { ascending: false }).limit(300), "bookings"),
  });
}
export type ClientBooking = NonNullable<ReturnType<typeof useClientBookings>["data"]>[number];

export function useClientQuotes(uid: string) {
  return useQuery({
    queryKey: key(uid, "quotes"), refetchInterval: 60000,
    queryFn: () => must(supabase.from("quote_requests").select("id, created_at, status, event_date, budget, message, guests, artist_id, artists(stage_name, slug, hue)").eq("client_user_id", uid).order("created_at", { ascending: false }).limit(200), "requests"),
  });
}
export type ClientQuote = NonNullable<ReturnType<typeof useClientQuotes>["data"]>[number];

export function useBookingExtras(uid: string) {
  const get = useServerFn(getClientBookingExtras);
  return useQuery({ queryKey: key(uid, "extras"), queryFn: () => get(), refetchInterval: 60000 });
}

export function useThreads(uid: string) {
  const get = useServerFn(listClientConversations);
  return useQuery({ queryKey: key(uid, "threads"), queryFn: () => get(), refetchInterval: 20000 });
}

export function useWallet(uid: string) {
  return useQuery({
    queryKey: key(uid, "wallet"), refetchInterval: 60000,
    queryFn: async () => {
      const rows = await must(supabase.rpc("client_wallet"), "wallet");
      const w = rows?.[0];
      return { lifetime: Number(w?.lifetime ?? 0), available: Number(w?.available ?? 0), pending: Number(w?.pending ?? 0), onHold: Number(w?.on_hold ?? 0), processing: Number(w?.processing ?? 0), withdrawn: Number(w?.withdrawn ?? 0), minimum: Number(w?.min_withdrawal ?? 500), rate: Number(w?.commission_pct ?? 2), enabled: w?.enabled ?? true };
    },
  });
}

export function useCommissions(uid: string) {
  return useQuery({ queryKey: key(uid, "commissions"), refetchInterval: 60000, queryFn: async () => (await must(supabase.rpc("client_commissions"), "commission")) as CommissionRow[] });
}

export function usePayouts(uid: string) {
  return useQuery({ queryKey: key(uid, "payouts"), queryFn: async () => (await must(supabase.from("client_payout_requests").select("id, reference, amount, status, created_at, decided_at, paid_at, admin_note, account_snapshot").eq("user_id", uid).order("created_at", { ascending: false }), "withdrawals")) as PayoutRow[] });
}

export function usePayoutAccount(uid: string) {
  return useQuery({ queryKey: key(uid, "account"), queryFn: () => must(supabase.from("client_payout_accounts").select("*").eq("user_id", uid).maybeSingle(), "payout account") });
}

export function useProfile(uid: string) {
  return useQuery({ queryKey: key(uid, "profile"), queryFn: () => must(supabase.from("profiles").select("display_name, phone, company_name, country, account_type, created_at").eq("id", uid).maybeSingle(), "profile") });
}

export const DEFAULT_SETTINGS = { whatsapp_reminders: true, booking_alerts: true, commission_alerts: true, notifications_read_at: null as string | null };
export function useSettings(uid: string) {
  return useQuery({
    queryKey: key(uid, "settings"),
    queryFn: async () => {
      const row = await must(supabase.from("client_settings").select("whatsapp_reminders, booking_alerts, commission_alerts, notifications_read_at").eq("user_id", uid).maybeSingle(), "settings");
      return row ?? DEFAULT_SETTINGS;
    },
  });
}

export function useSupport(uid: string) {
  return useQuery({ queryKey: key(uid, "support"), refetchInterval: 60000, queryFn: () => must(supabase.from("support_requests").select("id, reference, topic, booking_id, message, status, admin_reply, replied_at, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(50), "support requests") });
}

export function useTeamAccess(uid: string) {
  return useQuery({ queryKey: key(uid, "teams"), queryFn: async () => (await supabase.from("artist_members").select("artist_id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "active")).count ?? 0 });
}

export function useRefresh(uid: string) {
  const qc = useQueryClient();
  return (...names: string[]) => Promise.all((names.length ? names : [""]).map((n) => qc.invalidateQueries({ queryKey: n ? key(uid, n) : ["cp", uid] })));
}
