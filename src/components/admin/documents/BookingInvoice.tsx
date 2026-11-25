import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { InvoicePaper } from "@/components/dashboard/InvoicePaper";
import { downloadPaper } from "@/components/chat/shell/InvoiceSheet";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { bookingPaper, type BookingForInvoice } from "@/lib/admin-documents";
import { A4Dialog } from "./A4Dialog";

/** A booking's invoice on A4. The artist's tax number is added when this admin may read it. */
export function BookingInvoiceDialog({ booking, artistId, onClose, below }: { booking: BookingForInvoice; artistId?: string | undefined; onClose: () => void; below?: ReactNode }) {
  const issuer = useSiteSettings().invoice;
  const trn = useQuery({
    queryKey: ["admin-artist-trn", artistId], enabled: !!artistId,
    queryFn: async () => (await supabase.rpc("private_artists").select("trn").eq("id", artistId!).maybeSingle()).data?.trn ?? null,
  }).data ?? null;
  const paper = bookingPaper(booking, trn);
  return (
    <A4Dialog title="Invoice" onClose={onClose} onDownload={() => downloadPaper(paper, issuer)} below={below}>
      <InvoicePaper data={paper} tall />
    </A4Dialog>
  );
}

/** Loads a booking by id for pages that only hold the reference. */
export function BookingInvoiceById({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["admin-booking-invoice", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("id, artist_id, invoice_no, client_name, client_email, package_title, amount, vat_amount, total, paid_amount, paid_at, created_at, event_date, status, invoice_items, notes, artists(stage_name)").eq("id", bookingId).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  if (!query.data) return <A4Dialog title="Invoice" onClose={onClose}><p role={query.isPending ? "status" : "alert"} className="p-8 text-center text-muted-foreground">{query.isPending ? "Loading invoice…" : "This booking cannot be opened. It may be deleted, or you may not have access to operations."}</p></A4Dialog>;
  return <BookingInvoiceDialog booking={{ ...query.data, artist_name: query.data.artists?.stage_name ?? "Artist" }} artistId={query.data.artist_id} onClose={onClose} />;
}
