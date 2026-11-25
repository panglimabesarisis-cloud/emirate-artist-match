import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { paperForBooking, paperForInvoice, savedInvoice } from "@/lib/chat-invoice";
import type { Invoice } from "@/lib/invoice";
import type { PaperData } from "./InvoicePaper";

/** The latest invoice of each quote request's chat: a saved invoice, otherwise a booking that has an invoice number. */
export function useQuoteInvoices(artistId: string) {
  return useQuery({
    queryKey: ["quote-invoices", artistId],
    queryFn: async () => {
      const [artist, chats, saved, bookings] = await Promise.all([
        supabase.rpc("private_artists").select("stage_name, trn").eq("id", artistId).maybeSingle(),
        supabase.from("conversations").select("id, quote_request_id").eq("artist_id", artistId).not("quote_request_id", "is", null),
        supabase.from("service_invoices").select("id, status, total, paid_at, created_at, deleted_at, booking_id, conversation_id, document").eq("artist_id", artistId).order("created_at", { ascending: false }),
        supabase.from("bookings").select("id, conversation_id, client_name, package_title, total, amount, vat_amount, invoice_no, invoice_items, created_at, paid_amount, paid_at").eq("artist_id", artistId).is("deleted_at", null).order("created_at", { ascending: false }),
      ]);
      if (chats.error) throw chats.error;
      const parties = { artistName: artist.data?.stage_name ?? "", trn: artist.data?.trn };
      const papers = new Map<string, PaperData>();
      for (const chat of chats.data ?? []) {
        if (!chat.quote_request_id || papers.has(chat.quote_request_id)) continue;
        const row = saved.data?.find(item => item.conversation_id === chat.id && !item.deleted_at && item.document);
        const booking = bookings.data?.find(item => item.id === row?.booking_id) ?? bookings.data?.find(item => item.conversation_id === chat.id && item.invoice_no);
        if (row) papers.set(chat.quote_request_id, paperForInvoice(row.document as unknown as Invoice, savedInvoice(row, booking), { ...parties, client: booking?.client_name }));
        else if (booking) papers.set(chat.quote_request_id, paperForBooking({
          title: booking.package_title ?? "Booking", total: Number(booking.total), amount: Number(booking.amount), vat: Number(booking.vat_amount), number: booking.invoice_no,
          items: booking.invoice_items, createdAt: booking.created_at, paidAmount: Number(booking.paid_amount), paidAt: booking.paid_at, client: booking.client_name,
        }, parties));
      }
      return papers;
    },
  });
}
