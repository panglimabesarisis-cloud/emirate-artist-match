import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowUpRight, BadgeCheck, CalendarCheck, CheckCircle2, Clock, Download, FileText, Gem, MessageSquare, Plus, Receipt, Star } from "lucide-react";
import { searchArtists } from "@/lib/public.functions";
import { toCsv, downloadCsv } from "@/lib/csv";
import { useI18n } from "@/lib/i18n";
import { BOOKING_FILTERS, buildFeed, dubaiGreeting, hoursUntilRelease, relativeTime, type BookingStateKey } from "@/lib/client-portal-rules";
import { ESCROW_HOLD_HOURS } from "@/lib/booking-rules";
import { ClientChatRoom } from "@/components/chat/ClientChatRoom";
import { usePortal } from "../portal-context";
import { usePortalRows, type PortalRow } from "../derived";
import { useCommissions, usePayouts, useProfile, useSettings, useSupport, useThreads, useWallet } from "../useClientPortal";
import { ArtistPhoto, CardHead, Empty, Kpi, LoadError, PageHead, Skeleton, Status, money, moneyShort, shortDate } from "../ui";

const ACTION_LABEL: Record<string, string> = { quotation: "Review", pay: "Pay now", job: "Confirm", review: "Review artist", chat: "Open chat", details: "View" };

export function RowAction({ row }: { row: PortalRow }) {
  const { openModal, go } = usePortal();
  const { t } = useI18n();
  const a = row.state.action;
  const run = () => {
    if (row.kind === "request") { if (row.threadId) go("messages", row.threadId); else toast.error(t("This request has no conversation yet.")); return; }
    if (a === "quotation") openModal({ type: "quotation", id: row.id });
    else if (a === "pay") openModal({ type: "pay", id: row.id });
    else if (a === "job") openModal({ type: "confirm-job", id: row.id });
    else if (a === "review") openModal({ type: "review", id: row.id });
    else openModal({ type: "booking", id: row.id });
  };
  return <button type="button" className="cp-tiny-btn" onClick={run}>{t(ACTION_LABEL[a] ?? "View")}</button>;
}

function rateLabel(rate: number) {
  return Number.isInteger(rate) ? `${String(rate).padStart(2, "0")}%` : `${rate}%`;
}

function feedBookings(rows: PortalRow[]) {
  return rows.flatMap((r) => r.booking ? [{ ...r.booking, artist_name: r.artist }] : []);
}

export function Overview() {
  const { uid, email, go, openModal } = usePortal();
  const { t } = useI18n();
  const profile = useProfile(uid);
  const wallet = useWallet(uid);
  const commissions = useCommissions(uid);
  const payouts = usePayouts(uid);
  const support = useSupport(uid);
  const settings = useSettings(uid);
  const { rows, isLoading, error } = usePortalRows(uid);
  const bookings = rows.filter((r) => r.kind === "booking");
  const name = (profile.data?.display_name || email.split("@")[0] || "there").toUpperCase();
  const actions = bookings.filter((r) => ["quotation", "pay", "job", "review"].includes(r.state.action));
  const confirmed = bookings.filter((r) => ["confirmed", "in_progress", "job_review"].includes(r.state.key)).length;
  const w = wallet.data;
  const feed = buildFeed({ bookings: feedBookings(rows), payouts: payouts.data ?? [], support: support.data ?? [], commissions: commissions.data ?? [], bookingAlerts: settings.data?.booking_alerts ?? true, commissionAlerts: settings.data?.commission_alerts ?? true }).slice(0, 4);
  const ICONS = { quotation: FileText, pay: Receipt, job: CheckCircle2, review: Star } as const;
  const TITLES = { quotation: "Quotation awaiting approval", pay: "Payment due", job: "Confirm job completion", review: "Review your artist" } as const;
  const progress = w ? Math.min(100, Math.round((w.available / Math.max(1, w.minimum)) * 100)) : 0;
  return (
    <section className="cp-page" aria-labelledby="cp-hello">
      <div className="cp-hero">
        <div>
          <div className="cp-eyebrow">{t("Client portal · Overview")}</div>
          <h1 id="cp-hello">{t(dubaiGreeting()).toUpperCase()},<br /><span className="it">{name}.</span></h1>
          <p>{t("Manage your artist bookings, confirm completed jobs and keep track of your commission earnings, all in one place.")}</p>
          <div className="cp-hero-actions">
            <button type="button" className="cp-btn cp-btn-gold" onClick={() => openModal({ type: "new-booking" })}><Plus aria-hidden="true" />{t("Book an artist")}</button>
            <button type="button" className="cp-btn cp-btn-line" onClick={() => go("bookings")}>{t("View bookings")} <ArrowUpRight aria-hidden="true" /></button>
          </div>
        </div>
        <div className="cp-hero-art" aria-hidden="true"><div className="cp-big-num it">{w ? rateLabel(w.rate) : "··"}</div><small>{t("Client commission rate")}</small></div>
      </div>
      {error ? <div style={{ marginTop: 17 }}><LoadError error={error} /></div> : null}
      <div className="cp-grid" style={{ marginTop: 17 }}>
        <Kpi label="Total bookings" value={isLoading ? "…" : bookings.length} sub="Across all booking statuses" icon={CalendarCheck} />
        <Kpi label="Pending actions" value={isLoading ? "…" : actions.length} sub={actions.length ? "Need your attention" : "Nothing waiting for you"} icon={Clock} />
        <Kpi label="Confirmed jobs" value={isLoading ? "…" : confirmed} sub="Ready or in progress" icon={CheckCircle2} />
        <Kpi label="Available commission" value={w ? moneyShort(w.available) : "…"} sub={w ? `AED ${w.minimum.toLocaleString("en-US")} minimum withdrawal` : "Loading"} icon={Gem} highlight />

        <div className="cp-card cp-span-7">
          <CardHead title="Action required" text="Items waiting for your response" aside={<Status tone={actions.length ? "gold" : "green"}>{actions.length ? `${actions.length} ${t(actions.length === 1 ? "ACTION" : "ACTIONS")}` : t("ALL CLEAR")}</Status>} />
          {isLoading ? <Skeleton /> : actions.length === 0 ? <Empty title="All caught up" text="No quotations, payments or job confirmations are waiting for you." /> : (
            <div className="cp-list">{actions.slice(0, 5).map((r) => {
              const k = r.state.action as keyof typeof ICONS; const Icon = ICONS[k];
              const extra = k === "job" ? ` · ${t("auto-confirms in")} ${hoursUntilRelease(r.booking?.completed_at ?? null) ?? ESCROW_HOLD_HOURS}h` : k === "pay" ? ` · ${money(r.value)}` : "";
              return <div key={r.id} className="cp-list-item"><div className="cp-mini-icon" aria-hidden="true"><Icon /></div><div className="cp-grow"><b>{t(TITLES[k])}</b><small>{r.ref} · {r.event}{extra}</small></div><RowAction row={r} /></div>;
            })}</div>
          )}
        </div>

        <div className="cp-card cp-span-5">
          <CardHead title="Commission snapshot" text="Your booking partner earnings" aside={<button type="button" className="cp-text-link" onClick={() => go("commission")}>{t("Details")} <ArrowUpRight size={13} aria-hidden="true" /></button>} />
          <div className="cp-wallet-hero">
            <small>{t("AVAILABLE BALANCE")}</small>
            <div className="cp-amount">{w ? money(w.available) : "…"}</div>
            <div className="cp-row cp-between"><small>{t("Minimum withdrawal")} {w ? moneyShort(w.minimum) : ""}</small><Status tone={w && w.available >= w.minimum ? "green" : "gold"}>{t(w && w.available >= w.minimum ? "Eligible" : "Building up")}</Status></div>
            <div className="cp-progress" style={{ marginTop: 13 }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={t("Progress to minimum withdrawal")}><i style={{ width: `${progress}%` }} /></div>
            <button type="button" className="cp-btn cp-btn-gold" style={{ marginTop: 15 }} onClick={() => go("withdrawals")}>{t("Withdraw funds")} <ArrowUpRight aria-hidden="true" /></button>
          </div>
        </div>

        <div className="cp-card cp-span-7">
          <CardHead title="Recent bookings" text="Your latest artist reservations" aside={<button type="button" className="cp-text-link" onClick={() => go("bookings")}>{t("View all")} <ArrowUpRight size={13} aria-hidden="true" /></button>} />
          {isLoading ? <Skeleton /> : bookings.length === 0 ? <Empty title="No bookings yet" text="Send a booking request and the artist's offer will appear here." action={<button type="button" className="cp-btn cp-btn-gold" onClick={() => go("browse")}>{t("Browse artists")}</button>} /> : (
            <div className="cp-table-wrap"><table><thead><tr><th>{t("Artist / Service")}</th><th>{t("Event date")}</th><th>{t("Booking value")}</th><th>{t("Status")}</th></tr></thead><tbody>
              {bookings.slice(0, 4).map((r) => <tr key={r.id}><td><div className="cp-artist-cell"><ArtistPhoto name={r.artist} hue={r.hue} /><div><b>{r.artist}</b><small>{r.event}</small></div></div></td><td>{shortDate(r.date)}</td><td><b>{money(r.value)}</b></td><td><Status tone={r.state.tone}>{t(r.state.label)}</Status></td></tr>)}
            </tbody></table></div>
          )}
        </div>

        <div className="cp-card cp-span-5">
          <CardHead title="Recent activity" text="Latest updates from your account" aside={<button type="button" className="cp-text-link" onClick={() => go("notifications")}>{t("All")} <ArrowUpRight size={13} aria-hidden="true" /></button>} />
          {feed.length === 0 ? <Empty title="Quiet for now" text="Booking, payment and commission updates will show here." /> : (
            <div className="cp-list">{feed.map((e) => <button type="button" key={e.id} className="cp-list-item cp-list-button" onClick={() => go(e.section as never)}><div className="cp-mini-icon" aria-hidden="true">{e.kind === "commission" ? <Gem /> : e.kind === "payout" ? <Receipt /> : e.kind === "support" ? <MessageSquare /> : <CalendarCheck />}</div><div className="cp-grow"><b>{t(e.title)}</b><small>{e.detail} · {t(relativeTime(e.at))}</small></div></button>)}</div>
          )}
        </div>
      </div>
    </section>
  );
}

export function Browse() {
  const { openModal } = usePortal();
  const { t } = useI18n();
  const search = useServerFn(searchArtists);
  const artists = useQuery({ queryKey: ["cp-artists"], queryFn: () => search({ data: {} }), staleTime: 5 * 60_000 });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const categories = useMemo(() => [...new Map((artists.data ?? []).filter((a) => a.category).map((a) => [a.category!.slug, a.category!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [artists.data]);
  const list = (artists.data ?? []).filter((a) => (!cat || a.category?.slug === cat) && `${a.stage_name} ${a.category?.name ?? ""} ${a.subcategory?.name ?? ""} ${a.emirate?.name ?? ""} ${a.tagline ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section className="cp-page">
      <PageHead eyebrow="Discover talent" title="BROWSE ARTISTS" text="Discover talent for your next event, campaign or production." />
      <div className="cp-toolbar">
        <input className="cp-input cp-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search artists or categories…")} aria-label={t("Search artists or categories")} />
        <select className="cp-input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t("Category")}><option value="">{t("All categories")}</option>{categories.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select>
        <span className="cp-spacer" />
        <span className="cp-muted cp-small">{artists.data ? `${list.length} ${t(list.length === 1 ? "artist" : "artists")}` : ""}</span>
      </div>
      {artists.error ? <LoadError error={artists.error} /> : artists.isLoading ? <div className="cp-artist-grid">{[0, 1, 2].map((i) => <div key={i} className="cp-skeleton" style={{ height: 230 }} />)}</div> : list.length === 0 ? <div className="cp-card"><Empty title="No artists found" text="Try another search or category." /></div> : (
        <div className="cp-artist-grid">{list.map((a) => {
          const verified = a.badges.some((b) => b.startsWith("verified"));
          return (
            <article key={a.id} className="cp-artist-card">
              <div className="cp-artist-cover" style={{ background: `radial-gradient(circle at 65% 20%, oklch(0.55 0.09 ${a.hue}), oklch(0.32 0.05 ${a.hue + 40}) 60%, var(--card))` }}>
                <span aria-hidden="true">{a.stage_name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                <span className="cp-row" style={{ gap: 6, font: "inherit" }}>{verified && <Status tone="green"><BadgeCheck size={12} aria-hidden="true" />{t("Verified")}</Status>}{a.stats.rating ? <Status tone="gold"><Star size={11} aria-hidden="true" />{a.stats.rating.toFixed(1)}</Status> : null}</span>
              </div>
              <div className="cp-artist-info">
                <h3>{a.stage_name}</h3>
                <p>{[a.category?.name, a.emirate?.name].filter(Boolean).join(" · ") || t("UAE")}</p>
                <div className="cp-artist-foot">
                  <b style={{ fontSize: 12 }}>{moneyShort(a.base_price)} <small className="cp-muted">{t("starting")}</small></b>
                  <span className="cp-row" style={{ gap: 6 }}>
                    <Link to="/artist/$slug" params={{ slug: a.slug }} className="cp-tiny-btn">{t("Profile")}</Link>
                    <button type="button" className="cp-tiny-btn" onClick={() => openModal({ type: "new-booking", artistId: a.id })}>{t("Book artist")}</button>
                  </span>
                </div>
              </div>
            </article>
          );
        })}</div>
      )}
    </section>
  );
}

export function Bookings() {
  const { uid, openModal } = usePortal();
  const { t } = useI18n();
  const { rows, isLoading, error } = usePortalRows(uid);
  const [q, setQ] = useState("");
  const [f, setF] = useState<"" | BookingStateKey>("");
  const shown = rows.filter((r) => (!f || r.state.key === f) && `${r.ref} ${r.artist} ${r.event} ${r.service}`.toLowerCase().includes(q.trim().toLowerCase()));
  const exportCsv = () => {
    downloadCsv(`dealmaker-bookings-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(shown, [["Reference", (r) => r.ref], ["Artist", (r) => r.artist], ["Event", (r) => r.event], ["Event date", (r) => r.date ?? ""], ["Value (AED)", (r) => r.value.toFixed(2)], ["Payment", (r) => r.payment.label], ["Status", (r) => r.state.label]]));
    toast.success(t("CSV export generated."));
  };
  return (
    <section className="cp-page">
      <PageHead eyebrow="Workspace" title="MY BOOKINGS" text="Track every artist request, quotation, payment and job status." actions={<button type="button" className="cp-btn cp-btn-gold" onClick={() => openModal({ type: "new-booking" })}><Plus aria-hidden="true" />{t("New booking")}</button>} />
      <div className="cp-card">
        <div className="cp-toolbar">
          <input className="cp-input cp-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search artist, booking ID or event…")} aria-label={t("Search bookings")} />
          <select className="cp-input" value={f} onChange={(e) => setF(e.target.value as BookingStateKey | "")} aria-label={t("Status")}><option value="">{t("All statuses")}</option>{BOOKING_FILTERS.map((x) => <option key={x.key} value={x.key}>{t(x.label)}</option>)}</select>
          <span className="cp-spacer" />
          <button type="button" className="cp-btn cp-btn-line" disabled={!shown.length} onClick={exportCsv}><Download aria-hidden="true" />{t("Export")}</button>
        </div>
        {error ? <LoadError error={error} /> : isLoading ? <Skeleton rows={4} /> : (
          <div className="cp-table-wrap"><table><thead><tr><th>{t("Booking")}</th><th>{t("Artist / Service")}</th><th>{t("Event date")}</th><th>{t("Value")}</th><th>{t("Payment")}</th><th>{t("Status")}</th><th>{t("Action")}</th></tr></thead><tbody>
            {shown.length === 0 ? <tr><td colSpan={7}><Empty title={rows.length ? "No matches" : "No bookings yet"} text={rows.length ? "No bookings match your search." : "Browse artists and send a request to start."} /></td></tr> : shown.map((r) => (
              <tr key={`${r.kind}-${r.id}`}>
                <td><b>{r.ref}</b><small>{r.event}</small></td>
                <td><div className="cp-artist-cell"><ArtistPhoto name={r.artist} hue={r.hue} /><div><b>{r.artist}</b><small>{t(r.service)}</small></div></div></td>
                <td>{shortDate(r.date)}</td>
                <td><b>{r.value ? money(r.value) : "—"}</b>{r.kind === "request" && r.value ? <small>{t("Budget")}</small> : null}</td>
                <td><Status tone={r.payment.tone}>{t(r.payment.label)}</Status></td>
                <td><Status tone={r.state.tone}>{t(r.state.label)}</Status></td>
                <td><div className="cp-row" style={{ gap: 6 }}><RowAction row={r} />{r.kind === "booking" && r.state.action !== "details" && <button type="button" className="cp-tiny-btn" onClick={() => openModal({ type: "booking", id: r.id })}>{t("View")}</button>}</div></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </div>
    </section>
  );
}

export function Jobs() {
  const { uid, openModal } = usePortal();
  const { t } = useI18n();
  const { rows, isLoading, error } = usePortalRows(uid);
  const waiting = rows.filter((r) => r.state.key === "job_review");
  const upcoming = rows.filter((r) => r.state.key === "in_progress");
  return (
    <section className="cp-page">
      <PageHead eyebrow="Booking workflow" title="JOB CONFIRMATIONS" text="Confirm completed services or report an issue within the review period." />
      <div className="cp-grid">
        <div className="cp-card cp-span-8">
          <CardHead title="Awaiting your confirmation" text="Jobs the artist or talent manager marked as completed" aside={<Status tone={waiting.length ? "gold" : "green"}>{waiting.length} {t("PENDING")}</Status>} />
          {error ? <LoadError error={error} /> : isLoading ? <Skeleton /> : waiting.length === 0 ? <Empty title="All caught up" text="No jobs are waiting for your confirmation." /> : waiting.map((r) => {
            const hours = hoursUntilRelease(r.booking?.completed_at ?? null);
            return (
              <div key={r.id} style={{ paddingBottom: 16, marginBottom: 16, borderBottom: "1px solid var(--cp-line)" }}>
                <div className="cp-list-item" style={{ borderBottom: 0, padding: 0 }}>
                  <ArtistPhoto name={r.artist} hue={r.hue} />
                  <div className="cp-grow"><b>{r.artist} · {r.event}</b><small>{r.ref} · {shortDate(r.date)} · {money(r.value)}</small>
                    <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><Status tone="gold">{t("Awaiting completion")}</Status><span className="cp-muted cp-small">{hours ? `${t("Payment is released automatically in")} ${hours}h ${t("if no issue is reported.")}` : t("Payment is being released.")}</span></div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 15, flexWrap: "wrap" }}>
                  <button type="button" className="cp-btn cp-btn-gold" onClick={() => openModal({ type: "confirm-job", id: r.id })}><CheckCircle2 aria-hidden="true" />{t("Confirm job completed")}</button>
                  <button type="button" className="cp-btn cp-btn-danger" onClick={() => openModal({ type: "dispute", id: r.id })}>{t("Report an issue")}</button>
                </div>
              </div>
            );
          })}
          {upcoming.length > 0 && <>
            <h3 className="cp-eyebrow" style={{ margin: "18px 0 10px" }}>{t("Waiting for the artist to mark completion")}</h3>
            <div className="cp-list">{upcoming.map((r) => <div key={r.id} className="cp-list-item"><ArtistPhoto name={r.artist} hue={r.hue} /><div className="cp-grow"><b>{r.artist} · {r.event}</b><small>{r.ref} · {t("Event on")} {shortDate(r.date)}</small></div><button type="button" className="cp-tiny-btn" onClick={() => openModal({ type: "dispute", id: r.id })}>{t("Report an issue")}</button></div>)}</div>
          </>}
        </div>
        <div className="cp-card cp-span-4">
          <CardHead title="How it works" text="Completion confirmation policy" />
          <div className="cp-list">
            <div className="cp-list-item"><div className="cp-mini-icon">01</div><div className="cp-grow"><b>{t("Artist marks the job completed")}</b><small>{t("Possible on or after the event date, once the booking is fully paid.")}</small></div></div>
            <div className="cp-list-item"><div className="cp-mini-icon">02</div><div className="cp-grow"><b>{t("You review the job")}</b><small>{t("Confirm completion to release payment now, or report an issue to freeze it.")}</small></div></div>
            <div className="cp-list-item"><div className="cp-mini-icon">03</div><div className="cp-grow"><b>{t(`Automatic release after ${ESCROW_HOLD_HOURS} hours`)}</b><small>{t("If no issue is reported, payment is released to the artist and your commission becomes available.")}</small></div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

const stars = (n: number) => "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));

export function Reviews() {
  const { uid, openModal } = usePortal();
  const { t } = useI18n();
  const { rows, isLoading, error } = usePortalRows(uid);
  const pending = rows.filter((r) => r.state.action === "review");
  const published = rows.filter((r) => r.extras?.review);
  return (
    <section className="cp-page">
      <PageHead eyebrow="Your feedback" title="MY REVIEWS" text="Share your experience with artists you have booked." />
      <div className="cp-grid">
        <div className="cp-card cp-span-7">
          <CardHead title="Reviews to write" text="Only completed bookings can be reviewed, once per booking" />
          {error ? <LoadError error={error} /> : isLoading ? <Skeleton /> : pending.length === 0 ? <Empty title="Nothing to review" text="Reviews open after a booking is completed." /> : (
            <div className="cp-list">{pending.map((r) => <div key={r.id} className="cp-list-item"><ArtistPhoto name={r.artist} hue={r.hue} /><div className="cp-grow"><b>{r.artist} · {r.event}</b><small>{r.ref} · {t("Completed")} {shortDate(r.booking?.completed_at ?? r.date)}</small></div><button type="button" className="cp-tiny-btn" onClick={() => openModal({ type: "review", id: r.id })}>{t("Write review")}</button></div>)}</div>
          )}
        </div>
        <div className="cp-card cp-span-5">
          <CardHead title="Published reviews" text="Your submitted feedback" />
          {published.length === 0 ? <Empty title="No reviews yet" text="Your verified reviews will appear here." /> : published.map((r) => {
            const rv = r.extras!.review!;
            return <div key={rv.id} className="cp-review-card"><div className="cp-row cp-between"><b>{r.artist}</b>{rv.status !== "published" && <Status tone="gold">{t(rv.status)}</Status>}</div><div className="cp-stars" aria-label={`${rv.rating} ${t("out of 5 stars")}`}>{stars(rv.rating)}</div>{rv.body && <p dir="auto">{rv.body}</p>}<small>{r.event} · {shortDate(rv.created_at)}</small>{r.slug && <div style={{ marginTop: 8 }}><Link to="/artist/$slug" params={{ slug: r.slug }} className="cp-text-link">{t("See it on the profile")} <ArrowUpRight size={13} aria-hidden="true" /></Link></div>}</div>;
          })}
        </div>
      </div>
    </section>
  );
}

export function Messages({ thread }: { thread?: string | undefined }) {
  const { uid, go } = usePortal();
  const { t } = useI18n();
  const threads = useThreads(uid);
  const list = threads.data ?? [];
  const current = list.find((x) => x.id === thread) ?? list[0];
  return (
    <section className="cp-page">
      <PageHead eyebrow="Communication" title="MESSAGES" text="Conversations with the artists and their AI booking managers." actions={<button type="button" className="cp-btn cp-btn-line" onClick={() => go("browse")}>{t("Find another artist")}</button>} />
      {threads.error ? <LoadError error={threads.error} /> : threads.isLoading ? <div className="cp-card"><Skeleton /></div> : list.length === 0 ? <div className="cp-card"><Empty title="No conversations yet" text="Send a booking request and the artist's booking manager replies here." action={<button type="button" className="cp-btn cp-btn-gold" onClick={() => go("browse")}>{t("Browse artists")}</button>} /></div> : (
        <div className="cp-grid">
          <div className="cp-card cp-span-4">
            <CardHead title="Conversations" text={`${list.length} ${t(list.length === 1 ? "chat" : "chats")}`} />
            <div className="cp-list" role="list">{list.map((x) => (
              <button key={x.id} type="button" role="listitem" aria-current={x.id === current?.id ? "true" : undefined} className="cp-list-item cp-list-button" onClick={() => go("messages", x.id)}>
                <ArtistPhoto name={x.artist?.stage_name ?? "Artist"} hue={x.artist?.hue} className="cp-avatar" />
                <div className="cp-grow"><div className="cp-thread-meta"><b>{x.artist?.stage_name ?? t("Artist")}</b><small style={{ marginTop: 0 }}>{t(relativeTime(x.lastMessageAt))}</small></div><small>{x.preview || t("No messages yet")}</small></div>
                {x.lastSender && x.lastSender !== "client" && <Status tone="gold">{t("New")}</Status>}
              </button>
            ))}</div>
          </div>
          <div className="cp-card cp-span-8">
            {current && <>
              <CardHead title={current.artist?.stage_name ?? "Conversation"} text={current.mode === "human" ? "The artist is replying personally" : "AI booking manager replying for the artist"} aside={<Status tone="green">{t("Secure chat")}</Status>} />
              <div className="cp-chat"><ClientChatRoom key={current.id} id={current.id} k={current.key} embedded className="flex h-full min-h-0 flex-col bg-background" /></div>
            </>}
          </div>
        </div>
      )}
    </section>
  );
}
