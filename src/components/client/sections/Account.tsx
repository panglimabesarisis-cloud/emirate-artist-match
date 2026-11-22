import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bell, CalendarCheck, Gem, LifeBuoy, MessageSquare, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { buildFeed, relativeTime } from "@/lib/client-portal-rules";
import { usePortal, type ClientSection } from "../portal-context";
import { usePortalRows } from "../derived";
import { DEFAULT_SETTINGS, useCommissions, usePayouts, useProfile, useRefresh, useSettings, useSupport, useWallet } from "../useClientPortal";
import { CardHead, Empty, Field, LoadError, PageHead, Skeleton, Status, moneyShort, shortDate } from "../ui";

const COUNTRIES = ["United Arab Emirates", "Saudi Arabia", "Qatar", "Bahrain", "Kuwait", "Oman", "Egypt", "Jordan", "Lebanon", "India", "Pakistan", "Indonesia", "Philippines", "United Kingdom", "United States", "Other"];

export function Profile() {
  const { uid, email } = usePortal();
  const { t } = useI18n();
  const profile = useProfile(uid);
  const refresh = useRefresh(uid);
  const [v, setV] = useState({ display_name: "", phone: "", company_name: "", country: "United Arab Emirates", account_type: "individual" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const p = profile.data;
    if (p) setV({ display_name: p.display_name ?? "", phone: p.phone ?? "", company_name: p.company_name ?? "", country: p.country ?? "United Arab Emirates", account_type: p.account_type ?? "individual" });
  }, [profile.data]);
  const phoneBad = !!v.phone && !/^\+[1-9]\d{7,14}$/.test(v.phone);
  const nameBad = v.display_name.trim().length < 2;
  const save = async () => {
    if (phoneBad || nameBad) { toast.error(t("Check the highlighted fields.")); return; }
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ display_name: v.display_name.trim().slice(0, 80), phone: v.phone || null, company_name: v.company_name.trim().slice(0, 120) || null, country: v.country || null, account_type: v.account_type }).eq("id", uid);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("Your profile has been saved."));
    await refresh("profile");
  };
  return (
    <section className="cp-page">
      <PageHead eyebrow="Account" title="MY PROFILE" text="Your contact and company details, used when you send booking requests." actions={<button type="button" className="cp-btn cp-btn-gold" disabled={busy || profile.isLoading} onClick={save}>{t(busy ? "Saving…" : "Save changes")}</button>} />
      <div className="cp-card">
        {profile.error ? <LoadError error={profile.error} /> : profile.isLoading ? <Skeleton /> : (
          <form className="cp-form-grid" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <Field label="Full name" htmlFor="cp-name" hint={nameBad ? "Enter at least 2 characters." : null} bad={nameBad}><input id="cp-name" maxLength={80} autoComplete="name" value={v.display_name} onChange={(e) => setV({ ...v, display_name: e.target.value })} aria-invalid={nameBad || undefined} /></Field>
            <Field label="Email address" htmlFor="cp-email" hint="Change your sign-in email in Account settings."><input id="cp-email" value={email} disabled dir="ltr" /></Field>
            <Field label="WhatsApp number" htmlFor="cp-phone" hint={phoneBad ? "Use the international format, for example +971501234567." : "Used for booking and payment reminders."} bad={phoneBad}><input id="cp-phone" type="tel" dir="ltr" autoComplete="tel" placeholder="+971501234567" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value.replace(/[^+\d]/g, "") })} aria-invalid={phoneBad || undefined} /></Field>
            <Field label="Company name" htmlFor="cp-company"><input id="cp-company" maxLength={120} autoComplete="organization" value={v.company_name} onChange={(e) => setV({ ...v, company_name: e.target.value })} /></Field>
            <Field label="Country" htmlFor="cp-country"><select id="cp-country" value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Account type" htmlFor="cp-type"><select id="cp-type" value={v.account_type} onChange={(e) => setV({ ...v, account_type: e.target.value })}><option value="individual">{t("Individual")}</option><option value="company">{t("Company")}</option><option value="agency">{t("Agency")}</option></select></Field>
            <button type="submit" hidden />
          </form>
        )}
        {profile.data?.created_at && <p className="cp-muted cp-small" style={{ marginTop: 6 }}>{t("Member since")} {shortDate(profile.data.created_at)}</p>}
      </div>
    </section>
  );
}

export function Notifications() {
  const { uid, go } = usePortal();
  const { t } = useI18n();
  const settings = useSettings(uid);
  const { rows, isLoading } = usePortalRows(uid);
  const payouts = usePayouts(uid);
  const support = useSupport(uid);
  const commissions = useCommissions(uid);
  const refresh = useRefresh(uid);
  const s = settings.data ?? DEFAULT_SETTINGS;
  const feed = buildFeed({ bookings: rows.flatMap((r) => r.booking ? [{ ...r.booking, artist_name: r.artist }] : []), payouts: payouts.data ?? [], support: support.data ?? [], commissions: commissions.data ?? [], bookingAlerts: s.booking_alerts, commissionAlerts: s.commission_alerts });
  const readAt = s.notifications_read_at;
  const unread = feed.filter((e) => !readAt || e.at > readAt).length;
  const markRead = async () => {
    const { error } = await supabase.from("client_settings").upsert({ user_id: uid, whatsapp_reminders: s.whatsapp_reminders, booking_alerts: s.booking_alerts, commission_alerts: s.commission_alerts, notifications_read_at: new Date().toISOString() });
    if (error) { toast.error(error.message); return; }
    toast.success(t("Notifications marked as read."));
    await refresh("settings");
  };
  const ICON = { booking: CalendarCheck, commission: Gem, payout: Receipt, support: MessageSquare } as const;
  return (
    <section className="cp-page">
      <PageHead eyebrow="Account" title="NOTIFICATIONS" text="Updates on your bookings, jobs, payments and commission." actions={<button type="button" className="cp-btn cp-btn-line" disabled={!unread} onClick={markRead}>{t("Mark all as read")}</button>} />
      <div className="cp-card">
        <CardHead title={unread ? `${unread} ${t("unread")}` : "You're up to date"} text="Choose which updates appear here in Settings." aside={<button type="button" className="cp-text-link" onClick={() => go("settings")}>{t("Settings")}</button>} />
        {isLoading ? <Skeleton rows={4} /> : feed.length === 0 ? <Empty title="No notifications" text="Booking, commission and support updates will appear here." /> : (
          <div className="cp-list">{feed.slice(0, 60).map((e) => { const Icon = ICON[e.kind]; return (
            <button type="button" key={e.id} className={`cp-list-item cp-list-button${!readAt || e.at > readAt ? " is-unread" : ""}`} onClick={() => go(e.section as ClientSection)}>
              <div className="cp-mini-icon" aria-hidden="true"><Icon /></div><div className="cp-grow"><b>{t(e.title)}</b><small>{e.detail}</small></div><small style={{ marginTop: 0, whiteSpace: "nowrap" }}>{t(relativeTime(e.at))}</small>
            </button>
          ); })}</div>
        )}
      </div>
    </section>
  );
}

const TOPICS = [["booking", "Booking assistance"], ["payment", "Payment issue"], ["commission", "Commission / withdrawal"], ["account", "Account support"]] as const;

export function Support() {
  const { uid } = usePortal();
  const { t } = useI18n();
  const support = useSupport(uid);
  const wallet = useWallet(uid);
  const { rows } = usePortalRows(uid);
  const refresh = useRefresh(uid);
  const [topic, setTopic] = useState<(typeof TOPICS)[number][0]>("booking");
  const [booking, setBooking] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const bookings = rows.filter((r) => r.kind === "booking");
  const tooShort = message.trim().length < 10;
  const send = async () => {
    if (tooShort) { toast.error(t("Please write at least 10 characters.")); return; }
    setBusy(true);
    const { error } = await supabase.from("support_requests").insert({ topic, message: message.trim().slice(0, 2000), booking_id: booking || null, user_id: uid });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("Support request sent. We reply here and in Notifications."));
    setMessage(""); setBooking("");
    await refresh("support");
  };
  const w = wallet.data;
  return (
    <section className="cp-page">
      <PageHead eyebrow="Help & support" title="SUPPORT CENTER" text="Get help with a booking, payment, commission or your account." />
      <div className="cp-grid">
        <div className="cp-card cp-span-6">
          <CardHead title="Contact support" text="Our team replies in this portal" />
          <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <Field label="Topic" htmlFor="cp-topic"><select id="cp-topic" value={topic} onChange={(e) => setTopic(e.target.value as typeof topic)}>{TOPICS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></Field>
            <Field label="Related booking (optional)" htmlFor="cp-sb"><select id="cp-sb" value={booking} onChange={(e) => setBooking(e.target.value)}><option value="">{t("None")}</option>{bookings.map((b) => <option key={b.id} value={b.id}>{b.ref} · {b.artist} · {b.event}</option>)}</select></Field>
            <Field label="Message" htmlFor="cp-msg" hint={`${message.trim().length} / 2000`}><textarea id="cp-msg" maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("Tell us how we can help…")} /></Field>
            <button type="submit" className="cp-btn cp-btn-gold" disabled={busy || tooShort}><LifeBuoy aria-hidden="true" />{t(busy ? "Sending…" : "Submit support request")}</button>
          </form>
        </div>
        <div className="cp-card cp-span-6">
          <CardHead title="Help topics" />
          <div className="cp-list">
            <div className="cp-list-item"><div className="cp-grow"><b>{t("How do I confirm a completed job?")}</b><small>{t("Open Job Confirmations and choose Confirm job completed. Payment then goes to the artist straight away.")}</small></div></div>
            <div className="cp-list-item"><div className="cp-grow"><b>{t("When can I withdraw commission?")}</b><small>{w ? `${t("When your available balance reaches")} ${moneyShort(w.minimum)} ${t("and your payout account is verified.")}` : t("When your available balance reaches the minimum and your payout account is verified.")}</small></div></div>
            <div className="cp-list-item"><div className="cp-grow"><b>{t("How is commission calculated?")}</b><small>{w ? `${w.rate}% ${t("of the booking value before VAT, fixed when you first pay. It becomes available once the artist's payment is released.")}` : t("A percentage of the booking value before VAT, fixed when you first pay.")}</small></div></div>
            <div className="cp-list-item"><div className="cp-grow"><b>{t("Can I cancel a booking?")}</b><small>{t("Yes, from the booking details: 14+ days before the event refunds 100%, 7 to 13 days 50%, under 7 days nothing.")}</small></div></div>
          </div>
        </div>
        <div className="cp-card cp-span-12">
          <CardHead title="Your requests" text="Replies from the Dealmaker team" />
          {support.error ? <LoadError error={support.error} /> : support.isLoading ? <Skeleton /> : (support.data ?? []).length === 0 ? <Empty title="No requests yet" text="Requests you send appear here with our reply." /> : (
            <div className="cp-list">{(support.data ?? []).map((r) => (
              <div key={r.id} className="cp-list-item" style={{ alignItems: "flex-start" }}>
                <div className="cp-mini-icon" aria-hidden="true"><Bell /></div>
                <div className="cp-grow"><b>{r.reference} · {t(TOPICS.find(([k]) => k === r.topic)?.[1] ?? r.topic)}</b><small dir="auto">{r.message}</small>{r.admin_reply && <div className="cp-review-card" style={{ marginTop: 8, marginBottom: 0 }}><b className="cp-small">{t("Dealmaker team")}</b><p dir="auto" style={{ margin: "4px 0 0" }}>{r.admin_reply}</p><small>{r.replied_at ? shortDate(r.replied_at) : ""}</small></div>}<small>{shortDate(r.created_at)}</small></div>
                <Status tone={r.status === "answered" ? "green" : r.status === "closed" ? "plain" : "gold"}>{t(r.status === "answered" ? "Answered" : r.status === "closed" ? "Closed" : "Open")}</Status>
              </div>
            ))}</div>
          )}
        </div>
      </div>
    </section>
  );
}

export function Settings() {
  const { uid } = usePortal();
  const { t } = useI18n();
  const settings = useSettings(uid);
  const refresh = useRefresh(uid);
  const [v, setV] = useState(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (settings.data) setV(settings.data); }, [settings.data]);
  const dirty = !!settings.data && (v.whatsapp_reminders !== settings.data.whatsapp_reminders || v.booking_alerts !== settings.data.booking_alerts || v.commission_alerts !== settings.data.commission_alerts);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("client_settings").upsert({ user_id: uid, whatsapp_reminders: v.whatsapp_reminders, booking_alerts: v.booking_alerts, commission_alerts: v.commission_alerts, notifications_read_at: v.notifications_read_at });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("Settings saved."));
    await refresh("settings");
  };
  const rows: [keyof typeof v, string, string][] = [
    ["whatsapp_reminders", "WhatsApp payment reminders", "The reminder sent 7 days before an event when a balance is still due. Booking links and offers are always sent."],
    ["booking_alerts", "Booking updates in Notifications", "Quotations, payments, completed jobs, cancellations and support replies."],
    ["commission_alerts", "Commission updates in Notifications", "Commission credited and withdrawal decisions."],
  ];
  return (
    <section className="cp-page">
      <PageHead eyebrow="Preferences" title="SETTINGS" text="Choose how Dealmaker keeps you updated." actions={<button type="button" className="cp-btn cp-btn-gold" disabled={busy || !dirty} onClick={save}>{t(busy ? "Saving…" : "Save settings")}</button>} />
      <div className="cp-grid">
        <div className="cp-card cp-span-8">
          <CardHead title="Communication" />
          {settings.error ? <LoadError error={settings.error} /> : settings.isLoading ? <Skeleton /> : rows.map(([k, label, hint]) => (
            <div key={k} className="cp-setting"><label htmlFor={`cp-set-${k}`}><b>{t(label)}</b><small>{t(hint)}</small></label><Switch id={`cp-set-${k}`} checked={Boolean(v[k])} onCheckedChange={(c) => setV({ ...v, [k]: c })} /></div>
          ))}
        </div>
        <div className="cp-card cp-span-4">
          <CardHead title="Sign-in & security" text="Password, email and account closure" />
          <p className="cp-muted cp-small" style={{ marginTop: 0 }}>{t("Manage how you sign in, change your password or request account closure.")}</p>
          <Link to="/account" className="cp-btn cp-btn-line">{t("Open account settings")}</Link>
        </div>
      </div>
    </section>
  );
}
