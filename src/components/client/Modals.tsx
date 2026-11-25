import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, CreditCard, ExternalLink, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCatalog, searchArtists } from "@/lib/public.functions";
import { submitClientQuote } from "@/lib/chat.functions";
import { useWhatsAppProof, WhatsAppVerify } from "@/components/shared/WhatsAppVerify";
import { useAccountPhone } from "@/components/shared/AccountWhatsApp";
import { acceptAndPay, acceptBookingOffer, cancelBookingAsClient, confirmBookingCompletion, getBooking, openDisputeAsClient, submitBookingReview } from "@/lib/bookings.functions";
import { bookingPayment } from "@/lib/booking-payment-rules";
import { CONTRACT_TERMS, ESCROW_HOLD_HOURS, canClientConfirm, canDispute, refundAmount, refundShare } from "@/lib/booking-rules";
import { hoursUntilRelease, withdrawalProblem } from "@/lib/client-portal-rules";
import { validateHostedUrl } from "@/lib/hosted-checkout";
import { useI18n } from "@/lib/i18n";
import { usePortal, type PortalModal } from "./portal-context";
import { usePortalRows, type PortalRow } from "./derived";
import { usePayoutAccount, useProfile, useRefresh, useWallet } from "./useClientPortal";
import { Field, Modal, Status, money, shortDate } from "./ui";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const todayDubai = () => new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
const time = (v: string | null | undefined) => (v ? v.slice(0, 5) : "");

function useBookingRow(id: string) {
  const { uid } = usePortal();
  const { rows, isLoading } = usePortalRows(uid);
  const row = rows.find((r) => r.kind === "booking" && r.id === id) ?? null;
  return { row, b: row?.booking ?? null, isLoading };
}

function Missing({ onClose, loading }: { onClose: () => void; loading: boolean }) {
  const { t } = useI18n();
  return <><p className="cp-muted cp-small">{t(loading ? "Loading booking…" : "This booking is no longer available.")}</p><div className="cp-modal-actions"><button type="button" className="cp-btn cp-btn-line" onClick={onClose}>{t("Close")}</button></div></>;
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="cp-modal-actions">{children}</div>;
}

function Summary({ row }: { row: PortalRow }) {
  const { t } = useI18n();
  const b = row.booking!;
  return (
    <dl className="cp-dl">
      <dt>{t("Reference")}</dt><dd>{row.ref}</dd>
      <dt>{t("Artist")}</dt><dd>{row.artist}</dd>
      <dt>{t("Service")}</dt><dd>{row.event}{b.event_types?.name ? ` · ${b.event_types.name}` : ""}</dd>
      <dt>{t("Event date")}</dt><dd>{shortDate(b.event_date)}{b.start_time ? ` · ${time(b.start_time)}${b.end_time ? `–${time(b.end_time)}` : ""}` : ""}</dd>
    </dl>
  );
}

function Money({ row }: { row: PortalRow }) {
  const { t } = useI18n();
  const b = row.booking!;
  const p = bookingPayment(Number(b.total), Number(b.paid_amount), b.deposit_pct);
  return (
    <div className="cp-wallet-hero">
      <small>{t("TOTAL INCL. 5% VAT")}</small>
      <div className="cp-amount">{money(p.total)}</div>
      <dl className="cp-dl">
        <dt>{t("Subtotal")}</dt><dd>{money(p.subtotal)}</dd>
        <dt>{t("VAT 5%")}</dt><dd>{money(p.vatAmount)}</dd>
        <dt>{t("Paid")}</dt><dd>{money(Number(b.paid_amount))}</dd>
        {p.dueMinor > 0 && !["cancelled", "completed"].includes(b.status) && <><dt>{t(Number(b.paid_amount) > 0 ? "Balance due" : `Deposit due (${b.deposit_pct}%)`)}</dt><dd><b>{money(p.dueAmount)}</b></dd></>}
      </dl>
    </div>
  );
}

function BookingDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const { openModal, go } = usePortal();
  const { t } = useI18n();
  const { row, b, isLoading } = useBookingRow(id);
  if (!row || !b) return <Missing onClose={onClose} loading={isLoading} />;
  const steps: [string, string | null][] = [["Requested", b.created_at], ["Contract accepted", b.contract_accepted_at], ["Paid", b.paid_at], ["Marked completed", b.completed_at], ["You confirmed", b.client_confirmed_at], ["Payment released", b.escrow_released_at], ["Cancelled", b.cancelled_at]];
  const disputes = row.extras?.disputes ?? [];
  const cancellable = ["inquiry", "quoted", "confirmed"].includes(b.status);
  return (
    <>
      <div className="cp-row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}><Status tone={row.state.tone}>{t(row.state.label)}</Status><Status tone={row.payment.tone}>{t(row.payment.label)}</Status>{b.client_commission_pct != null && <Status tone="plain">{t("Your commission")} {Number(b.client_commission_pct)}%</Status>}</div>
      <Summary row={row} />
      <Money row={row} />
      {b.notes && <div className="cp-note" style={{ whiteSpace: "pre-wrap", marginBottom: 12 }} dir="auto"><b>{t("Event details")}</b><br />{b.notes}</div>}
      <ol className="cp-dl" style={{ listStyle: "none", padding: 0 }} aria-label={t("Timeline")}>
        {steps.filter(([, at]) => at).map(([label, at]) => <li key={label} style={{ display: "contents" }}><span className="cp-muted">{t(label)}</span><span>{new Date(at!).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" })}</span></li>)}
      </ol>
      {disputes.length > 0 && <div className="cp-note" style={{ marginTop: 12 }}><b>{t("Reported issues")}</b>{disputes.map((d) => <p key={d.id} style={{ margin: "6px 0 0" }} dir="auto">{shortDate(d.created_at)} · {t(d.status)} · {d.reason}{d.resolution ? ` · ${d.resolution}` : ""}</p>)}</div>}
      <Actions>
        {row.threadId && <button type="button" className="cp-btn cp-btn-line" onClick={() => { onClose(); go("messages", row.threadId!); }}><MessageSquare aria-hidden="true" />{t("Open chat")}</button>}
        <Link to="/booking/$id" params={{ id: b.id }} search={{ k: b.access_key }} className="cp-btn cp-btn-line"><ExternalLink aria-hidden="true" />{t("Full booking page")}</Link>
        {cancellable && <button type="button" className="cp-btn cp-btn-danger" onClick={() => openModal({ type: "cancel", id })}>{t("Cancel booking")}</button>}
        {canDispute(b.status, b.escrow_status) && !disputes.some((d) => d.status === "open") && <button type="button" className="cp-btn cp-btn-danger" onClick={() => openModal({ type: "dispute", id })}>{t("Report an issue")}</button>}
        {row.state.action === "quotation" && <button type="button" className="cp-btn cp-btn-gold" onClick={() => openModal({ type: "quotation", id })}>{t("Review quotation")}</button>}
        {row.state.action === "pay" && <button type="button" className="cp-btn cp-btn-gold" onClick={() => openModal({ type: "pay", id })}><CreditCard aria-hidden="true" />{t("Pay now")}</button>}
        {row.state.action === "job" && <button type="button" className="cp-btn cp-btn-gold" onClick={() => openModal({ type: "confirm-job", id })}>{t("Confirm completion")}</button>}
        {row.state.action === "review" && <button type="button" className="cp-btn cp-btn-gold" onClick={() => openModal({ type: "review", id })}>{t("Write review")}</button>}
      </Actions>
    </>
  );
}

function Quotation({ id, onClose }: { id: string; onClose: () => void }) {
  const { uid, openModal } = usePortal();
  const { t } = useI18n();
  const { row, b, isLoading } = useBookingRow(id);
  const refresh = useRefresh(uid);
  const get = useServerFn(getBooking);
  const accept = useServerFn(acceptBookingOffer);
  const detail = useQuery({ queryKey: ["cp", uid, "booking-detail", id], enabled: !!b, queryFn: () => get({ data: { id, key: b!.access_key } }) });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!row || !b) return <Missing onClose={onClose} loading={isLoading} />;
  const contract = detail.data?.contract;
  const run = async () => {
    setBusy(true);
    try {
      await accept({ data: { id, key: b.access_key, agree } });
      toast.success(t("Quotation accepted. Your invoice has been issued."));
      await refresh("bookings");
      openModal({ type: "pay", id });
    } catch (e) { toast.error(t(errText(e))); } finally { setBusy(false); }
  };
  return (
    <>
      <Summary row={row} />
      <Money row={row} />
      <h3 className="cp-eyebrow" style={{ margin: "4px 0 8px" }}>{t("Booking contract")}</h3>
      <div className="cp-note" style={{ maxHeight: 220, overflow: "auto" }}>
        {detail.isLoading ? t("Loading contract…") : contract && contract.clauses.length > 0 ? (
          <ol style={{ margin: 0, paddingInlineStart: 18 }}>{contract.clauses.map((c, i) => <li key={i} style={{ marginBottom: 8 }}><b>{c.title}</b><div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div></li>)}{contract.rider && <li style={{ listStyle: "none" }}><b>{t("Rider")}</b><div style={{ whiteSpace: "pre-wrap" }}>{contract.rider}</div></li>}</ol>
        ) : <ol style={{ margin: 0, paddingInlineStart: 18 }}>{CONTRACT_TERMS.map((c) => <li key={c} style={{ marginBottom: 6 }}>{t(c)}</li>)}</ol>}
      </div>
      <label className="cp-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />{t("I have read and accept the booking contract and the quotation above.")}</label>
      <Actions>
        <button type="button" className="cp-btn cp-btn-line" onClick={onClose}>{t("Not now")}</button>
        <button type="button" className="cp-btn cp-btn-gold" disabled={!agree || busy || b.status === "inquiry"} onClick={run}>{t(busy ? "Accepting…" : "Accept quotation")}</button>
      </Actions>
    </>
  );
}

function Pay({ id, onClose }: { id: string; onClose: () => void }) {
  const { uid, openModal } = usePortal();
  const { t } = useI18n();
  const { row, b, isLoading } = useBookingRow(id);
  const profile = useProfile(uid);
  const pay = useServerFn(acceptAndPay);
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { setPhone((p) => p || b?.client_phone || profile.data?.phone || ""); }, [b?.client_phone, profile.data?.phone]);
  if (!row || !b) return <Missing onClose={onClose} loading={isLoading} />;
  const p = bookingPayment(Number(b.total), Number(b.paid_amount), b.deposit_pct);
  const accepted = !!b.contract_accepted_at;
  const phoneBad = !!phone && !/^\+[1-9]\d{7,14}$/.test(phone);
  if (!b.invoice_no) return <><p className="cp-muted cp-small">{t("Accept the quotation first. The invoice is issued when you accept, then you can pay.")}</p><Actions><button type="button" className="cp-btn cp-btn-gold" onClick={() => openModal({ type: "quotation", id })}>{t("Review quotation")}</button></Actions></>;
  const run = async () => {
    setBusy(true);
    try {
      const r = await pay({ data: { id, key: b.access_key, agree: true, phone: phone || undefined } });
      if ("error" in r) throw new Error(r.error);
      setUrl(validateHostedUrl(r.checkoutUrl));
    } catch (e) { toast.error(t(errText(e))); } finally { setBusy(false); }
  };
  return (
    <>
      <Summary row={row} />
      <div className="cp-wallet-hero">
        <small>{t(Number(b.paid_amount) > 0 ? "BALANCE DUE NOW" : `DEPOSIT DUE NOW (${b.deposit_pct}%)`)}</small>
        <div className="cp-amount">{money(p.dueAmount)}</div>
        <small>{t("Invoice")} {b.invoice_no} · {t("Total")} {money(p.total)} {t("incl. VAT")} {money(p.vatAmount)}{Number(b.paid_amount) > 0 ? ` · ${t("Paid")} ${money(Number(b.paid_amount))}` : ""}</small>
      </div>
      {url ? (
        <>
          <p className="cp-note">{t("Your secure payment page is ready. You return to your booking after paying. Test mode: use card 4242 4242 4242 4242 with any future date and CVC.")}</p>
          <Actions><a className="cp-btn cp-btn-gold" href={url}><CreditCard aria-hidden="true" />{t("Pay")} {money(p.dueAmount)}</a></Actions>
        </>
      ) : (
        <>
          <Field label="WhatsApp for booking updates" htmlFor="cp-pay-phone" hint={phoneBad ? "Use the international format, for example +971501234567." : "Optional. Payment reminders are sent here."} bad={phoneBad}><input id="cp-pay-phone" type="tel" dir="ltr" value={phone} placeholder="+971501234567" onChange={(e) => setPhone(e.target.value.replace(/[^+\d]/g, ""))} /></Field>
          {!accepted && <label className="cp-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />{t("I accept the booking contract.")}</label>}
          <p className="cp-muted cp-small">{t("Payment is held by Dealmaker and released to the artist after the job is completed. Demo mode: no real money is charged.")}</p>
          <Actions>
            <button type="button" className="cp-btn cp-btn-line" onClick={onClose}>{t("Cancel")}</button>
            <button type="button" className="cp-btn cp-btn-gold" disabled={busy || phoneBad || (!accepted && !agree) || p.dueMinor <= 0} onClick={run}>{t(busy ? "Preparing…" : "Continue to secure payment")}</button>
          </Actions>
        </>
      )}
    </>
  );
}

function ConfirmJob({ id, onClose }: { id: string; onClose: () => void }) {
  const { uid, openModal } = usePortal();
  const { t } = useI18n();
  const { row, b, isLoading } = useBookingRow(id);
  const refresh = useRefresh(uid);
  const confirm$ = useServerFn(confirmBookingCompletion);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!row || !b) return <Missing onClose={onClose} loading={isLoading} />;
  const allowed = canClientConfirm(b.status, b.escrow_status);
  const hours = hoursUntilRelease(b.completed_at);
  const run = async () => {
    setBusy(true);
    try {
      await confirm$({ data: { id, key: b.access_key } });
      toast.success(t("Thank you. Payment has been released to the artist."));
      await refresh();
      openModal({ type: "review", id });
    } catch (e) { toast.error(t(errText(e))); } finally { setBusy(false); }
  };
  return (
    <>
      <Summary row={row} />
      <p className="cp-note" style={{ marginTop: 12 }}>{allowed ? `${t("The artist marked this job as completed.")} ${hours ? `${t("If you do nothing, payment is released automatically in")} ${hours}h.` : ""}` : t("This job cannot be confirmed right now.")}</p>
      <label className="cp-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} disabled={!allowed} />{t("I confirm the service was delivered as agreed. Payment is released to the artist and can no longer be disputed.")}</label>
      <Actions>
        <button type="button" className="cp-btn cp-btn-danger" disabled={!allowed} onClick={() => openModal({ type: "dispute", id })}>{t("Report an issue")}</button>
        <button type="button" className="cp-btn cp-btn-gold" disabled={!allowed || !agree || busy} onClick={run}><CheckCircle2 aria-hidden="true" />{t(busy ? "Confirming…" : "Confirm job completed")}</button>
      </Actions>
    </>
  );
}

const DISPUTE_REASONS = ["The artist did not show up", "The performance was different from the agreement", "Late arrival or a shortened set", "Other"];

function Dispute({ id, onClose }: { id: string; onClose: () => void }) {
  const { uid } = usePortal();
  const { t } = useI18n();
  const { row, b, isLoading } = useBookingRow(id);
  const refresh = useRefresh(uid);
  const open$ = useServerFn(openDisputeAsClient);
  const [reason, setReason] = useState(DISPUTE_REASONS[0]!);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  if (!row || !b) return <Missing onClose={onClose} loading={isLoading} />;
  const allowed = canDispute(b.status, b.escrow_status);
  const short = detail.trim().length < 10;
  const run = async () => {
    setBusy(true);
    try {
      await open$({ data: { id, key: b.access_key, reason: `${reason}: ${detail.trim()}` } });
      toast.success(t("Issue reported. Payment is frozen while Dealmaker reviews it."));
      await refresh("bookings", "extras", "wallet", "commissions");
      onClose();
    } catch (e) { toast.error(t(errText(e))); } finally { setBusy(false); }
  };
  return (
    <>
      <Summary row={row} />
      {!allowed && <p className="cp-note" style={{ marginTop: 12 }}>{t("Issues can be reported on confirmed bookings and during the review period after completion.")}</p>}
      <div className="cp-form-grid" style={{ marginTop: 12 }}>
        <Field label="What went wrong" htmlFor="cp-d-reason" full><select id="cp-d-reason" value={reason} onChange={(e) => setReason(e.target.value)}>{DISPUTE_REASONS.map((r) => <option key={r} value={r}>{t(r)}</option>)}</select></Field>
        <Field label="Describe the problem" htmlFor="cp-d-detail" full hint={short ? "Write at least 10 characters." : `${detail.trim().length} / 1400`} bad={short && detail.length > 0}><textarea id="cp-d-detail" maxLength={1400} value={detail} onChange={(e) => setDetail(e.target.value)} /></Field>
      </div>
      <Actions><button type="button" className="cp-btn cp-btn-line" onClick={onClose}>{t("Cancel")}</button><button type="button" className="cp-btn cp-btn-danger" disabled={!allowed || short || busy} onClick={run}>{t(busy ? "Sending…" : "Submit report")}</button></Actions>
    </>
  );
}

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const { t } = useI18n();
  return <div role="group" aria-label={t(label)} className="cp-star-row">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-pressed={n <= value} aria-label={`${n} / 5`} onClick={() => onChange(n)}>★</button>)}</div>;
}

function Review({ id, onClose }: { id: string; onClose: () => void }) {
  const { uid } = usePortal();
  const { t } = useI18n();
  const { row, b, isLoading } = useBookingRow(id);
  const refresh = useRefresh(uid);
  const submit$ = useServerFn(submitBookingReview);
  const [v, setV] = useState({ rating: 5, performance: 5, punctuality: 5, communication: 5, body: "" });
  const [busy, setBusy] = useState(false);
  if (!row || !b) return <Missing onClose={onClose} loading={isLoading} />;
  const allowed = b.status === "completed" && !row.extras?.review;
  const short = v.body.trim().length < 10;
  const run = async () => {
    setBusy(true);
    try {
      await submit$({ data: { id, key: b.access_key, rating: v.rating, body: v.body, performance: v.performance, punctuality: v.punctuality, communication: v.communication } });
      toast.success(t("Thank you. Your review is published on the artist's profile."));
      await refresh("extras", "bookings");
      onClose();
    } catch (e) { toast.error(t(errText(e))); } finally { setBusy(false); }
  };
  return (
    <>
      <Summary row={row} />
      {!allowed ? <p className="cp-note" style={{ marginTop: 12 }}>{t(row.extras?.review ? "You already reviewed this booking." : "Reviews open after the job is completed.")}</p> : (
        <div className="cp-form-grid" style={{ marginTop: 12 }}>
          <Field label="Overall rating" htmlFor="cp-r-all" full><Stars label="Overall rating" value={v.rating} onChange={(n) => setV({ ...v, rating: n })} /></Field>
          <Field label="Performance" htmlFor="cp-r-perf"><Stars label="Performance" value={v.performance} onChange={(n) => setV({ ...v, performance: n })} /></Field>
          <Field label="Punctuality" htmlFor="cp-r-punc"><Stars label="Punctuality" value={v.punctuality} onChange={(n) => setV({ ...v, punctuality: n })} /></Field>
          <Field label="Communication" htmlFor="cp-r-comm"><Stars label="Communication" value={v.communication} onChange={(n) => setV({ ...v, communication: n })} /></Field>
          <Field label="Your review" htmlFor="cp-r-body" full hint={short ? "Write at least 10 characters." : `${v.body.trim().length} / 1500`} bad={short && v.body.length > 0}><textarea id="cp-r-body" maxLength={1500} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} placeholder={t("What stood out about the performance?")} /></Field>
        </div>
      )}
      <Actions><button type="button" className="cp-btn cp-btn-line" onClick={onClose}>{t("Close")}</button>{allowed && <button type="button" className="cp-btn cp-btn-gold" disabled={short || busy} onClick={run}>{t(busy ? "Publishing…" : "Publish review")}</button>}</Actions>
    </>
  );
}

function Cancel({ id, onClose }: { id: string; onClose: () => void }) {
  const { uid } = usePortal();
  const { t } = useI18n();
  const { row, b, isLoading } = useBookingRow(id);
  const refresh = useRefresh(uid);
  const cancel$ = useServerFn(cancelBookingAsClient);
  const [reason, setReason] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!row || !b) return <Missing onClose={onClose} loading={isLoading} />;
  const allowed = ["inquiry", "quoted", "confirmed"].includes(b.status);
  const paid = Number(b.paid_amount);
  const refund = refundAmount(paid, "client", b.event_date);
  const share = Math.round(refundShare("client", b.event_date) * 100);
  const run = async () => {
    setBusy(true);
    try {
      const r = await cancel$({ data: { id, key: b.access_key, reason } });
      toast.success(r.refund > 0 ? `${t("Booking cancelled. Refund:")} ${money(r.refund)}` : t("Booking cancelled."));
      await refresh();
      onClose();
    } catch (e) { toast.error(t(errText(e))); } finally { setBusy(false); }
  };
  return (
    <>
      <Summary row={row} />
      <div className="cp-note" style={{ marginTop: 12 }}>{paid > 0 ? `${t("You paid")} ${money(paid)}. ${t("Cancelling now refunds")} ${share}%: ${money(refund)}.` : t("Nothing has been paid yet, so no refund is needed.")} {t("Policy: 14+ days before the event 100%, 7 to 13 days 50%, under 7 days no refund.")}</div>
      <Field label="Reason (optional)" htmlFor="cp-c-reason" full><textarea id="cp-c-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <label className="cp-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} disabled={!allowed} />{t("I understand this cancels the booking and cannot be undone.")}</label>
      <Actions><button type="button" className="cp-btn cp-btn-line" onClick={onClose}>{t("Keep booking")}</button><button type="button" className="cp-btn cp-btn-danger" disabled={!allowed || !agree || busy} onClick={run}>{t(busy ? "Cancelling…" : "Cancel booking")}</button></Actions>
    </>
  );
}

function NewBooking({ artistId, onClose }: { artistId?: string | undefined; onClose: () => void }) {
  const { uid, go } = usePortal();
  const { t } = useI18n();
  const refresh = useRefresh(uid);
  const profile = useProfile(uid);
  const search = useServerFn(searchArtists);
  const artists = useQuery({ queryKey: ["cp-artists"], queryFn: () => search({ data: {} }), staleTime: 5 * 60_000 });
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: () => getCatalog(), staleTime: 60_000 });
  const send = useServerFn(submitClientQuote);
  const [v, setV] = useState({ artistId: artistId ?? "", title: "", eventTypeId: "", date: "", start: "", end: "", areaId: "", guests: "", budget: "", phone: "", message: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { setV((x) => ({ ...x, phone: x.phone || profile.data?.phone || "" })); }, [profile.data?.phone]);
  const artist = artists.data?.find((a) => a.id === v.artistId);
  const areasByEmirate = useMemo(() => (catalog.data?.emirates ?? []).map((e) => ({ e, areas: (catalog.data?.areas ?? []).filter((a) => a.emirate_id === e.id) })).filter((g) => g.areas.length), [catalog.data]);
  const budget = Number(v.budget);
  const phoneBad = !!v.phone && !/^\+[1-9]\d{7,14}$/.test(v.phone);
  const timeBad = !!v.start !== !!v.end;
  const whatsapp = useWhatsAppProof(v.phone);
  const account = useAccountPhone(uid);
  const accountPhone = account.data?.verified ? account.data.phone : null;
  const unverified = whatsapp.required && !whatsapp.proof && !(accountPhone && accountPhone === v.phone);
  const problems = [!v.artistId && "Choose an artist.", !(budget > 0) && "Enter your budget.", phoneBad && "Check the WhatsApp number.", unverified && "Verify your WhatsApp number first.", timeBad && "Add both start and end time."].filter(Boolean) as string[];
  const run = async () => {
    if (problems.length) { toast.error(t(problems[0]!)); return; }
    setBusy(true);
    try {
      const r = await send({ data: { phoneProof: whatsapp.proof, artistId: v.artistId, eventTitle: v.title || null, eventTypeId: v.eventTypeId || null, eventDate: v.date || null, startTime: v.start || null, endTime: v.end || null, areaId: v.areaId || null, guests: v.guests ? Number(v.guests) : null, budget, phone: v.phone || null, message: v.message || null } });
      toast.success(t("Request sent. The artist's booking manager is replying in Messages."));
      await refresh("quotes", "threads");
      onClose();
      go("messages", r.conversationId);
    } catch (e) { toast.error(t(errText(e))); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(); }}>
      <div className="cp-form-grid">
        <Field label="Artist" htmlFor="cp-n-artist" full><select id="cp-n-artist" required value={v.artistId} onChange={(e) => setV({ ...v, artistId: e.target.value, budget: "" })}><option value="">{t(artists.isLoading ? "Loading artists…" : "Choose an artist")}</option>{(artists.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.stage_name}{a.category ? ` · ${a.category.name}` : ""}</option>)}</select></Field>
        <Field label="Event name" htmlFor="cp-n-title"><input id="cp-n-title" maxLength={120} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder={t("e.g. Company gala dinner")} /></Field>
        <Field label="Event type" htmlFor="cp-n-type"><select id="cp-n-type" value={v.eventTypeId} onChange={(e) => setV({ ...v, eventTypeId: e.target.value })}><option value="">{t("Select")}</option>{(catalog.data?.eventTypes ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Event date" htmlFor="cp-n-date"><input id="cp-n-date" type="date" min={todayDubai()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
        <Field label="Location" htmlFor="cp-n-area"><select id="cp-n-area" value={v.areaId} onChange={(e) => setV({ ...v, areaId: e.target.value })}><option value="">{t("Select")}</option>{areasByEmirate.map((g) => <optgroup key={g.e.id} label={g.e.name}>{g.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>)}</select></Field>
        <Field label="Start time" htmlFor="cp-n-start" bad={timeBad} hint={timeBad ? "Add both start and end time." : null}><input id="cp-n-start" type="time" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} /></Field>
        <Field label="End time" htmlFor="cp-n-end"><input id="cp-n-end" type="time" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} /></Field>
        <Field label="Guests" htmlFor="cp-n-guests"><input id="cp-n-guests" type="number" min={1} max={100000} inputMode="numeric" value={v.guests} onChange={(e) => setV({ ...v, guests: e.target.value })} /></Field>
        <Field label="Budget (AED)" htmlFor="cp-n-budget"><input id="cp-n-budget" type="number" min={1} step="1" inputMode="decimal" required value={v.budget} onChange={(e) => setV({ ...v, budget: e.target.value })} /></Field>
        <Field label="WhatsApp" htmlFor="cp-n-phone" bad={phoneBad} hint={phoneBad ? "Use the international format, for example +971501234567." : null} full><WhatsAppVerify id="cp-n-phone" phone={v.phone} accountPhone={accountPhone} onChange={(phone) => setV((x) => ({ ...x, phone }))} onVerified={() => void account.refetch()} /></Field>
        <Field label="Details for the artist" htmlFor="cp-n-msg" full><textarea id="cp-n-msg" maxLength={1800} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} placeholder={t("Venue, dress code, set length, special requests…")} /></Field>
      </div>
      <p className="cp-muted cp-small">{t("Your request opens a chat with the artist's booking manager. You only pay after you accept a quotation.")}</p>
      <Actions><button type="button" className="cp-btn cp-btn-line" onClick={onClose}>{t("Cancel")}</button><button type="submit" className="cp-btn cp-btn-gold" disabled={busy}>{t(busy ? "Sending…" : "Send booking request")}</button></Actions>
    </form>
  );
}

function Withdraw({ onClose }: { onClose: () => void }) {
  const { uid, openModal } = usePortal();
  const { t } = useI18n();
  const wallet = useWallet(uid);
  const account = usePayoutAccount(uid);
  const refresh = useRefresh(uid);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const w = wallet.data;
  const a = account.data;
  useEffect(() => { if (w && !amount && w.available >= w.minimum) setAmount(w.available.toFixed(2)); }, [w, amount]);
  const problem = w ? withdrawalProblem({ amount: Number(amount), available: w.available, minimum: w.minimum, verifiedAccount: !!a?.verified_at, hasAccount: !!a }) : "Loading";
  const run = async () => {
    if (problem) return;
    setBusy(true);
    const { error } = await supabase.from("client_payout_requests").insert({ amount: Number(amount), user_id: uid });
    setBusy(false);
    if (error) { toast.error(t(error.message)); return; }
    toast.success(t("Withdrawal requested. Master Admin reviews it next."));
    await refresh("payouts", "wallet");
    onClose();
  };
  return (
    <>
      <div className="cp-wallet-hero"><small>{t("AVAILABLE BALANCE")}</small><div className="cp-amount">{w ? money(w.available) : "…"}</div><small>{t("Minimum withdrawal")} {w ? money(w.minimum) : ""}</small></div>
      <Field label="Amount (AED)" htmlFor="cp-w-amount" hint={problem && problem !== "Loading" ? problem : a ? `${t("Paid to")} ${a.bank_name} · •••• ${a.iban.slice(-4)}` : null} bad={!!problem && problem !== "Loading" && !!amount}><input id="cp-w-amount" type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Actions>
        {!a || !a.verified_at ? <button type="button" className="cp-btn cp-btn-line" onClick={() => openModal({ type: "payout-account" })}>{t(a ? "View payout account" : "Add payout account")}</button> : <button type="button" className="cp-btn cp-btn-line" onClick={onClose}>{t("Cancel")}</button>}
        <button type="button" className="cp-btn cp-btn-gold" disabled={!!problem || busy} onClick={run}>{t(busy ? "Submitting…" : "Submit request")}</button>
      </Actions>
    </>
  );
}

function PayoutAccount({ onClose }: { onClose: () => void }) {
  const { uid } = usePortal();
  const { t } = useI18n();
  const account = usePayoutAccount(uid);
  const refresh = useRefresh(uid);
  const [v, setV] = useState({ holder_name: "", bank_name: "", iban: "", swift: "", country: "United Arab Emirates" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { const a = account.data; if (a) setV({ holder_name: a.holder_name, bank_name: a.bank_name, iban: a.iban, swift: a.swift ?? "", country: a.country }); }, [account.data]);
  const iban = v.iban.replace(/\s+/g, "").toUpperCase();
  const swift = v.swift.replace(/\s+/g, "").toUpperCase();
  const bad = { holder: v.holder_name.trim().length < 2, bank: v.bank_name.trim().length < 2, iban: !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban), swift: !!swift && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(swift) };
  const invalid = Object.values(bad).some(Boolean);
  const run = async () => {
    if (invalid) return;
    setBusy(true);
    const { error } = await supabase.from("client_payout_accounts").upsert({ user_id: uid, holder_name: v.holder_name.trim(), bank_name: v.bank_name.trim(), iban, swift: swift || null, country: v.country.trim() || "United Arab Emirates" });
    setBusy(false);
    if (error) { toast.error(t(error.message)); return; }
    toast.success(t("Payout account saved. Master Admin verifies it before your first withdrawal."));
    await refresh("account");
    onClose();
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(); }}>
      <div className="cp-form-grid">
        <Field label="Account holder name" htmlFor="cp-a-holder" bad={bad.holder && !!v.holder_name}><input id="cp-a-holder" maxLength={120} autoComplete="name" value={v.holder_name} onChange={(e) => setV({ ...v, holder_name: e.target.value })} /></Field>
        <Field label="Bank name" htmlFor="cp-a-bank" bad={bad.bank && !!v.bank_name}><input id="cp-a-bank" maxLength={120} value={v.bank_name} onChange={(e) => setV({ ...v, bank_name: e.target.value })} /></Field>
        <Field label="IBAN" htmlFor="cp-a-iban" full hint={bad.iban && v.iban ? "Check the IBAN, for example AE070331234567890123456." : null} bad={bad.iban && !!v.iban}><input id="cp-a-iban" dir="ltr" maxLength={40} autoComplete="off" value={v.iban} onChange={(e) => setV({ ...v, iban: e.target.value.toUpperCase() })} placeholder="AE07 0331 2345 6789 0123 456" /></Field>
        <Field label="SWIFT / BIC (optional)" htmlFor="cp-a-swift" hint={bad.swift ? "SWIFT codes have 8 or 11 characters." : null} bad={bad.swift}><input id="cp-a-swift" dir="ltr" maxLength={11} value={v.swift} onChange={(e) => setV({ ...v, swift: e.target.value.toUpperCase() })} /></Field>
        <Field label="Bank country" htmlFor="cp-a-country"><input id="cp-a-country" maxLength={60} value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} /></Field>
      </div>
      <p className="cp-note">{t(account.data?.verified_at ? "Changing these details sends the account back for verification before the next withdrawal." : "Master Admin verifies new accounts before the first withdrawal.")}</p>
      <Actions><button type="button" className="cp-btn cp-btn-line" onClick={onClose}>{t("Cancel")}</button><button type="submit" className="cp-btn cp-btn-gold" disabled={invalid || busy}>{t(busy ? "Saving…" : "Save account")}</button></Actions>
    </form>
  );
}

const META: Record<PortalModal["type"], { title: string; text: string; wide?: boolean }> = {
  "new-booking": { title: "NEW BOOKING REQUEST", text: "Tell the artist about your event. You receive a quotation in Messages.", wide: true },
  booking: { title: "BOOKING DETAILS", text: "Status, payment and timeline for this booking." },
  quotation: { title: "REVIEW QUOTATION", text: "Check the offer and contract before accepting." },
  pay: { title: "INVOICE PAYMENT", text: "Pay securely. Funds are held until the job is completed." },
  "confirm-job": { title: "CONFIRM JOB COMPLETION", text: `Confirm the job or report an issue within ${ESCROW_HOLD_HOURS} hours of completion.` },
  dispute: { title: "REPORT AN ISSUE", text: "Payment stays frozen while Dealmaker reviews your report." },
  review: { title: "REVIEW YOUR ARTIST", text: "Verified reviews help other clients choose." },
  cancel: { title: "CANCEL BOOKING", text: "Check the refund before you cancel." },
  withdraw: { title: "REQUEST WITHDRAWAL", text: "Withdraw your available commission to your payout account." },
  "payout-account": { title: "PAYOUT ACCOUNT", text: "The bank account that receives your commission withdrawals." },
};

export function PortalModals({ modal, onClose }: { modal: PortalModal | null; onClose: () => void }) {
  const meta = modal ? META[modal.type] : null;
  return (
    <Modal open={!!modal} onClose={onClose} title={meta?.title ?? ""} {...(meta?.text ? { text: meta.text } : {})} {...(meta?.wide ? { wide: true } : {})}>
      {modal?.type === "new-booking" && <NewBooking key={modal.artistId ?? "any"} artistId={modal.artistId} onClose={onClose} />}
      {modal?.type === "booking" && <BookingDetails key={modal.id} id={modal.id} onClose={onClose} />}
      {modal?.type === "quotation" && <Quotation key={modal.id} id={modal.id} onClose={onClose} />}
      {modal?.type === "pay" && <Pay key={modal.id} id={modal.id} onClose={onClose} />}
      {modal?.type === "confirm-job" && <ConfirmJob key={modal.id} id={modal.id} onClose={onClose} />}
      {modal?.type === "dispute" && <Dispute key={modal.id} id={modal.id} onClose={onClose} />}
      {modal?.type === "review" && <Review key={modal.id} id={modal.id} onClose={onClose} />}
      {modal?.type === "cancel" && <Cancel key={modal.id} id={modal.id} onClose={onClose} />}
      {modal?.type === "withdraw" && <Withdraw onClose={onClose} />}
      {modal?.type === "payout-account" && <PayoutAccount onClose={onClose} />}
    </Modal>
  );
}
