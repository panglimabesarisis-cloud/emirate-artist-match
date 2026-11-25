import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Plus, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getChat } from "@/lib/chat.functions";
import { getConversationBookings } from "@/lib/bookings.functions";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/shared/LogoutButton";
import { ClientChatRoom } from "./ClientChatRoom";
import { ChatShell, type ChatSetting } from "./shell/ChatShell";
import { ChatSettingsPage, LanguageChoice, type Payments } from "./shell/ChatSettingsPage";
import { chatInvoices, type ChatBooking } from "./shell/billing-split";
import { forgetChat, readRecentChats, rememberChat } from "./shell/recent-chats";
import { usePayInvoice } from "./shell/InvoiceSheet";
import { CommissionPage } from "./shell/CommissionPage";

const SUGGESTIONS = ["Check availability", "What are your prices?", "I want to book"];

/** The client's chat from a secret link, full screen. The artist who owns the chat is sent to the take-over view. */
export function ClientChatPage({ id, k }: { id: string; k: string }) {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const owner = useQuery({
    queryKey: ["chat-owner", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("conversations").select("artist_id").eq("id", id).maybeSingle();
      if (!data) return false;
      const { data: owns } = await supabase.rpc("is_artist_owner", { _artist: data.artist_id });
      return !!owns;
    },
  });
  if (loading || (user && owner.isPending)) return <p role="status" className="p-16 text-center text-muted-foreground">{t("Loading…")}</p>;
  if (owner.data) return <Navigate to="/dashboard/chat/$id" params={{ id }} replace />;
  return <ClientShell id={id} k={k} />;
}

function ClientShell({ id, k }: { id: string; k: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const get$ = useServerFn(getChat);
  const offers$ = useServerFn(getConversationBookings);
  const payInvoice = usePayInvoice(id, k);
  const [page, setPage] = useState<ChatSetting | null>(null);
  // The same query keys as the chat room, so both read one copy.
  const { data } = useQuery({ queryKey: ["chat", id], queryFn: () => get$({ data: { id, key: k } }), refetchInterval: 5000 });
  const { data: offers } = useQuery({ queryKey: ["chat-offers", id], queryFn: () => offers$({ data: { id, key: k } }), refetchInterval: 10000, enabled: !!k });
  const [recent, setRecent] = useState(readRecentChats);
  const artistName = data?.artist?.stage_name;
  useEffect(() => { if (artistName) setRecent(rememberChat({ id, k, title: artistName })); }, [id, k, artistName]);
  useEffect(() => { document.documentElement.classList.add("dm-dash"); return () => document.documentElement.classList.remove("dm-dash"); }, []);

  const bookings: ChatBooking[] = (offers ?? []).map((o) => ({
    id: o.id, title: o.package_title ?? t("Booking"), date: o.event_date, total: Number(o.total ?? 0), status: o.status, accessKey: o.access_key,
    start: o.start_time, end: o.end_time, guests: o.guests, detail: o.job_detail, notes: o.notes, paidAt: o.paid_at, paidAmount: Number(o.paid_amount ?? 0),
    amount: Number(o.amount ?? 0), vat: Number(o.vat_amount ?? 0), number: o.invoice_no, items: o.invoice_items, createdAt: o.created_at, client: o.client_name, clientEmail: o.client_email,
  }));
  const openBooking = (b: ChatBooking) => { if (b.accessKey) void navigate({ to: "/booking/$id", params: { id: b.id }, search: { k: b.accessKey } }); };
  const payments: Payments = {
    // A booking offer is paid on its own page; an invoice goes through checkout.
    pay: async (item) => {
      if (item.kind === "booking") { openBooking(item.booking); return; }
      await payInvoice(item.row.inv.id!);
    },
    link: (item) => {
      const booking = item.kind === "booking" ? item.booking : bookings.find((b) => b.id === item.row.inv.bookingId);
      const path = booking?.accessKey ? `/booking/${booking.id}?k=${booking.accessKey}` : `/chat/${id}?k=${k}`;
      return window.location.origin + path;
    },
  };
  const slug = data?.artist?.slug;
  return (
    <ChatShell
      brand={<Link to="/"><i aria-hidden="true">D</i>Dealmaker</Link>}
      top={slug ? <Button asChild className="dmc-primary"><Link to="/artist/$slug" params={{ slug }}><Plus className="me-1 h-4 w-4" />{t("New request")}</Link></Button> : <Button className="dmc-primary" disabled><Plus className="me-1 h-4 w-4" />{t("New request")}</Button>}
      recent={recent.map((chat) => ({
        id: chat.id, title: chat.title, active: chat.id === id,
        onOpen: () => { if (chat.id !== id) void navigate({ to: "/chat/$id", params: { id: chat.id }, search: { k: chat.k } }); },
        onRemove: () => setRecent(forgetChat(chat.id)),
      }))}
      page={page}
      onPage={setPage}
      settings={(current) => (
        <ChatSettingsPage
          page={current}
          bookings={bookings}
          invoices={chatInvoices(data?.messages ?? [], data?.invoices ?? [])}
          parties={{ artistName: artistName ?? "", trn: data?.artist?.trn }}
          payments={payments}
          account={<ClientAccount linkSent={!!data?.linkSent} onCommission={() => setPage("commission")} />}
          commission={<CommissionPage />}
          paymentNote="Payments open on Stripe in test mode, so no real money is charged."
        />
      )}
    >
      {(sidebarButton) => <ClientChatRoom id={id} k={k} leading={sidebarButton} suggestions={SUGGESTIONS} className="flex h-full min-h-0 flex-col" />}
    </ChatShell>
  );
}

function ClientAccount({ linkSent, onCommission }: { linkSent: boolean; onCommission: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast.success(t("Chat link copied")); }
    catch { toast.error(t("Could not copy the link")); }
  };
  return (
    <>
      <article className="dmc-card">
        <h2>{user ? String(user.user_metadata?.["display_name"] ?? user.email) : t("Chatting Log")}</h2>
        {/* "Sent" is said only when a WhatsApp message with this link really went out. */}
        <p>{user ? user.email : linkSent
          ? t("Kami sudah mengirimkan link chat ini ke WhatsApp Anda, Anda bisa membuka kapan pun jika Anda inginkan.")
          : t("Simpan link chat ini agar Anda bisa membukanya kapan pun Anda inginkan.")}</p>
        <div className="dmc-actions">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => void copy()}><Copy className="me-1.5 h-4 w-4" />{t("Copy chat link")}</Button>
          {user ? <>
            <Button asChild variant="outline" className="rounded-full"><Link to="/account">{t("Account settings")}</Link></Button>
            <Button asChild variant="outline" className="rounded-full"><Link to="/client/dashboard">{t("My dashboard")}</Link></Button>
            <LogoutButton />
          </> : <Button asChild className="rounded-full"><Link to="/auth" search={{ redirect: "/client/dashboard" }}>{t("Sign in or create an account")}</Link></Button>}
        </div>
      </article>
      <article className="dmc-card">
        <h2>{t("Komisi Anda")}</h2>
        <p>{t("Anda berhak mendapatkan komisi berdasarkan total pembayaran yang sudah Anda lakukan, silakan Anda cek bagian Setting > Komisi. Akan tetapi Anda harus mendaftar terlebih dahulu dan Anda bisa memantau komisi Anda.")}</p>
        <div className="dmc-actions">
          {!user && <Button asChild className="dmc-pay"><Link to="/auth" search={{ redirect: "/client/dashboard" }}>{t("Daftar")}</Link></Button>}
          <Button type="button" variant="outline" className="rounded-full" onClick={onCommission}><Trophy className="me-1.5 h-4 w-4" />{t("Lihat Komisi")}</Button>
        </div>
      </article>
      <LanguageChoice />
    </>
  );
}
