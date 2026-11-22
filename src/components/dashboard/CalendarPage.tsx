import { BulkBar, NOT_DELETABLE, RowCheckbox, bookingDeletable, useHideRows, useSelection } from "./BulkSelect";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { completeCalendarConnect, disconnectCalendar, getCalendarEvents, startCalendarConnect } from "@/lib/calendar.functions";
import { completeBooking } from "@/lib/bookings.functions";
import { canComplete } from "@/lib/booking-rules";
import { bookingPay, bookingStage, STAGE_LABEL, stageClasses } from "@/lib/booking-stage";
import { aed } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StudioDonut, StudioHeading } from "./StudioPage";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const hhmm = (v: string | null) => (v ? v.slice(0, 5) : "");
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not set");

/** Minutes between start and end (end before start means it runs past midnight). */
function durationMin(start: string | null, end: string | null, notes: string | null): number | null {
  const m = /Performance duration:\s*(\d+)/i.exec(notes ?? "");
  if (m) return Number(m[1]);
  if (!start || !end) return null;
  const [h1 = 0, m1 = 0] = start.split(":").map(Number);
  const [h2 = 0, m2 = 0] = end.split(":").map(Number);
  let min = h2 * 60 + m2 - (h1 * 60 + m1);
  if (min <= 0) min += 1440;
  return min;
}
const fmtDur = (m: number | null) => (m == null ? "Not set" : `${m >= 60 ? `${Math.floor(m / 60)} h` : ""}${m % 60 ? ` ${m % 60} min` : ""}`.trim());
const locationOf = (notes: string | null) => /Venue \/ emirate:\s*(.+)/i.exec(notes ?? "")?.[1]?.trim() ?? "";

function waitForOAuth(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => { window.removeEventListener("message", onMessage); if (poll !== undefined) window.clearInterval(poll); };
    const onMessage = (e: MessageEvent) => {
      const type = e.data?.type;
      if (e.origin !== window.location.origin || e.source !== popup || e.data?.connectorId !== "google_calendar" || (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")) return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") { resolve(typeof e.data?.code === "string" ? e.data.code : null); return; }
      popup.close(); reject(new Error("Google Calendar connection failed."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => { if (!popup.closed) return; cleanup(); reject(new Error("The Google window was closed before finishing.")); }, 500);
  });
}

type ScheduleItem = { id: string; title: string; event_date: string; start_time: string; end_time: string; notes: string | null };
type Job = {
  id: string; client_name: string; package_title: string; event_date: string; start_time: string | null; end_time: string | null; status: string;
  total: number; paid_amount: number; notes: string | null; job_detail: string | null; escrow_status: string;
};
const done = (b: Job) => b.status === "completed";
const payState = (b: Job) => bookingPay(b);
const STAMP: Record<string, string> = { unpaid: "text-red-400", partial: "text-gold", paid: "text-emerald-400" };
const PAY_STYLE: Record<string, string> = {
  unpaid: "border-red-400/30 bg-red-500/10 text-red-300", partial: "border-transparent bg-gold/40 text-white", paid: "border-transparent bg-gradient-gold text-gold-foreground",
};
const CHIP = "inline-flex h-[22px] min-w-[72px] items-center justify-center whitespace-nowrap rounded-full border px-2.5 text-[10.5px] font-extrabold";
const th = "whitespace-nowrap border-b border-border bg-card px-3.5 py-3 text-start text-[11px] font-extrabold uppercase tracking-[.1em] text-gold";
const td = "border-b border-border px-3.5 py-3.5 align-middle whitespace-nowrap";

export function CalendarTab({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const start$ = useServerFn(startCalendarConnect), complete$ = useServerFn(completeCalendarConnect), events$ = useServerFn(getCalendarEvents), disc$ = useServerFn(disconnectCalendar), finish$ = useServerFn(completeBooking);
  const [view, setView] = useState<"day" | "week" | "month">("month");
  const [focus, setFocus] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Job | null>(null);
  const [q, setQ] = useState("");
  const [item, setItem] = useState<ScheduleItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", date: "", start: "09:00", end: "10:00", notes: "" });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"all" | "waiting" | "done">("all");
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(0);
  const selection = useSelection();
  const hide = useHideRows("soft_delete_bookings", [["cal-jobs", artistId], ["artist-bookings", artistId], ["contracts", artistId]], () => selection.clear());
  const month = ymd(new Date(focus.getFullYear(), focus.getMonth(), 1)).slice(0, 7);

  const jobsQ = useQuery({
    queryKey: ["cal-jobs", artistId],
    queryFn: async () => {
      const res = await supabase.from("bookings").select("id, client_name, package_title, event_date, start_time, end_time, status, total, paid_amount, notes, job_detail, escrow_status").eq("artist_id", artistId).is("deleted_at", null).neq("status", "cancelled").order("event_date").limit(500);
      if (res.error) throw res.error;
      return (res.data ?? []) as unknown as Job[];
    },
  });
  const blockedQ = useQuery({ queryKey: ["cal-blocked", artistId], queryFn: async () => (await supabase.from("availability").select("id, date, note").eq("artist_id", artistId)).data ?? [] });
  const itemsQ = useQuery({
    queryKey: ["schedule-items", artistId],
    queryFn: async () => {
      const res = await supabase.from("schedule_items").select("id, title, event_date, start_time, end_time, notes").eq("artist_id", artistId).order("event_date").order("start_time").limit(1000);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });
  const g = useQuery({ queryKey: ["gcal", month], queryFn: () => events$({ data: { month } }), retry: false });

  const jobs = jobsQ.data ?? [];
  const blocked = useMemo(() => new Map((blockedQ.data ?? []).map((b) => [b.date, b])), [blockedQ.data]);
  const byDate = useMemo(() => {
    const m = new Map<string, Job[]>();
    for (const j of jobs) m.set(j.event_date, [...(m.get(j.event_date) ?? []), j].sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99")));
    return m;
  }, [jobs]);
  const itemsByDate = useMemo(() => {
    const m = new Map<string, ScheduleItem[]>();
    for (const i of itemsQ.data ?? []) m.set(i.event_date, [...(m.get(i.event_date) ?? []), i]);
    return m;
  }, [itemsQ.data]);
  const openAdd = () => { setForm({ title: "", date: ymd(focus), start: "09:00", end: "10:00", notes: "" }); setAdding(true); };
  const saveItem = async () => {
    if (!form.title.trim() || !form.date || !form.start || !form.end) { toast.error(t("Add a title, a date, a start time and an end time.")); return; }
    setSaving(true);
    const { error } = await supabase.from("schedule_items").insert({ artist_id: artistId, title: form.title.trim(), event_date: form.date, start_time: form.start, end_time: form.end, notes: form.notes.trim() || null });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("Schedule added"));
    setAdding(false);
    void qc.invalidateQueries({ queryKey: ["schedule-items", artistId] });
  };
  const removeItem = async (i: ScheduleItem) => {
    if (!confirm(t("Delete this schedule?"))) return;
    const { error } = await supabase.from("schedule_items").delete().eq("id", i.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("Schedule deleted"));
    setItem(null);
    void qc.invalidateQueries({ queryKey: ["schedule-items", artistId] });
  };
  const gOn = (date: string) => (g.data?.events ?? []).filter((e) => (e.allDay ? e.start <= date && date < e.end : ymd(new Date(e.start)) <= date && date <= ymd(new Date(e.end))));

  const days = useMemo(() => {
    if (view === "day") return [focus];
    if (view === "week") { const s = new Date(focus.getFullYear(), focus.getMonth(), focus.getDate() - ((focus.getDay() + 6) % 7)); return Array.from({ length: 7 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i)); }
    const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
    const off = (first.getDay() + 6) % 7;
    const cells = Math.ceil((off + new Date(focus.getFullYear(), focus.getMonth() + 1, 0).getDate()) / 7) * 7;
    return Array.from({ length: cells }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - off + i));
  }, [view, focus]);
  const title = view === "month" ? focus.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : view === "week" ? `${days[0]!.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${days[6]!.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
    : focus.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const shift = (n: number) => setFocus(view === "month" ? new Date(focus.getFullYear(), focus.getMonth() + n, 1) : new Date(focus.getFullYear(), focus.getMonth(), focus.getDate() + n * (view === "week" ? 7 : 1)));
  const today = ymd(new Date());

  const toggleBlock = async (date: string) => {
    const ex = blocked.get(date);
    const { error } = ex ? await supabase.from("availability").delete().eq("id", ex.id) : await supabase.from("availability").insert({ artist_id: artistId, date, note: "Unavailable" });
    if (error) { toast.error(error.message); return; }
    toast.success(ex ? `${fmtDate(date)} ${t("is open again.")}` : `${fmtDate(date)} ${t("blocked. Clients can't book it.")}`);
    void qc.invalidateQueries({ queryKey: ["cal-blocked", artistId] });
  };
  // One click blocks the day (month view); a double click opens it. The delay keeps the double click from toggling.
  const [timer, setTimer] = useState<number | null>(null);
  const clickDay = (d: Date) => {
    if (timer) window.clearTimeout(timer);
    if (view !== "month") return;
    setTimer(window.setTimeout(() => { void toggleBlock(ymd(d)); setTimer(null); }, 230));
  };
  const openDay = (d: Date) => { if (timer) window.clearTimeout(timer); setTimer(null); setFocus(d); setView("day"); };

  const connect = async () => {
    const popup = window.open("", "lovable-oauth", "width=600,height=720");
    if (!popup) { toast.error(t("Popup blocked. Allow popups and try again.")); return; }
    setBusy(true);
    try {
      const { authorizationUrl } = await start$();
      const doneP = waitForOAuth(popup);
      popup.location.href = authorizationUrl;
      const code = await doneP;
      if (code) await complete$({ data: { code } });
      await qc.invalidateQueries({ queryKey: ["gcal"] });
      toast.success(t("Google Calendar connected"));
    } catch (e) { popup.close(); toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!confirm(t("Disconnect Google Calendar?"))) return;
    try { await disc$(); await qc.invalidateQueries({ queryKey: ["gcal"] }); toast.success(t("Google Calendar disconnected")); } catch (e) { toast.error((e as Error).message); }
  };

  const markDone = async (j: Job) => {
    if (done(j)) return;
    if (!canComplete(j.status, j.event_date) || Number(j.paid_amount) < Number(j.total)) { toast.error(t("A job can be marked done from the event date, once it is fully paid.")); return; }
    if (!confirm(t("Mark this job as done? Escrow is released to your wallet."))) return;
    try { await finish$({ data: { id: j.id } }); toast.success(t("Marked completed — escrow released")); void qc.invalidateQueries({ queryKey: ["cal-jobs", artistId] }); } catch (e) { toast.error(e instanceof Error ? e.message : t("Failed")); }
  };

  const counts = { all: jobs.length, waiting: jobs.filter((j) => !done(j)).length, done: jobs.filter(done).length };
  const revenue = jobs.reduce((n, j) => n + Number(j.total), 0);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return jobs.filter((j) => (tab === "all" || (tab === "done") === done(j)) && (!needle || `${j.client_name} ${j.package_title} ${locationOf(j.notes)}`.toLowerCase().includes(needle)))
      .sort((a, b) => (a.event_date + (a.start_time ?? "99")).localeCompare(b.event_date + (b.start_time ?? "99")));
  }, [jobs, q, tab]);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages - 1);
  const pageRows = rows.slice(cur * size, cur * size + size);
  const deletableOnPage = pageRows.filter(bookingDeletable);
  const gStatus = g.isLoading ? t("Checking…") : g.data?.connected ? `${t("Connected")}${g.data.email ? ` · ${g.data.email}` : ""}. ${t("Your events show on the calendar below.")}` : g.data?.reconnectRequired ? t("Your Google Calendar access needs to be renewed.") : g.isError ? t("Couldn't load Google Calendar.") : t("Connect your Google Calendar so your events appear here.");

  return (
    <div className="dmr-wrap dmr-cpage">
      <StudioHeading title="Calen" accent="dar">
        <div className="dmr-q-stats">
          <div className="dmr-qs"><small>{t("Total perform")}</small><b>{counts.done}</b></div>
          <div className="dmr-qs"><small>{t("Total revenue")}</small><b dir="ltr">{aed(revenue)}</b></div>
          <div className="dmr-qs"><small>{t("Total job")}</small><b>{counts.all}</b></div>
        </div>
      </StudioHeading>
      <p className="dmr-c-12 -mt-2 text-sm text-muted-foreground">{t("Your bookings by date. Click a day to block it so clients can't book it. Double-click a day to open it.")}</p>

      <section className="dmr-c-12 flex flex-wrap items-center gap-4 rounded-[20px] border border-gold/30 bg-gold/[.06] p-4" aria-label="Google Calendar">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold/15 text-gold"><CalendarDays className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1"><b>Google Calendar</b><p className="text-sm text-muted-foreground">{gStatus}</p></div>
        {g.data?.connected
          ? <Button variant="outline" className="rounded-full" onClick={() => void disconnect()}>{t("Disconnect")}</Button>
          : <Button className="rounded-full bg-gradient-gold font-bold text-gold-foreground" disabled={busy} onClick={() => void connect()}>{busy ? t("Connecting…") : g.data?.reconnectRequired ? t("Reconnect Google Calendar") : t("Connect Google Calendar")}</Button>}
      </section>

      <StudioDonut title={t("Job progress")} subtitle="Done vs waiting" unit="jobs" entries={[{ label: "Done", value: counts.done }, { label: "Waiting", value: counts.waiting }]} />
      <StudioDonut title={t("Payment status")} subtitle="Unpaid, partial and paid jobs" unit="jobs" entries={[{ label: "Unpaid", value: jobs.filter((j) => payState(j) === "unpaid").length }, { label: "Partial", value: jobs.filter((j) => payState(j) === "partial").length }, { label: "Paid", value: jobs.filter((j) => payState(j) === "paid").length }]} />

      <section className="dmr-panel dmr-c-12 overflow-hidden !p-0" aria-label={t("Calendar")}>
        <div className="grid items-center gap-3 border-b border-border px-5 py-4 md:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="rounded-full" aria-label={t("Previous")} onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" className="rounded-full" onClick={() => { const d = new Date(); setFocus(new Date(d.getFullYear(), d.getMonth(), d.getDate())); }}>{t("Today")}</Button>
            <Button variant="outline" size="icon" className="rounded-full" aria-label={t("Next")} onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <h2 className="font-display text-3xl leading-none md:text-center" aria-live="polite">{title}</h2>
          <div className="flex flex-wrap items-center gap-2 justify-self-end">
          <Button type="button" className="rounded-full bg-gradient-gold font-bold text-gold-foreground" onClick={openAdd}><Plus className="me-1.5 h-4 w-4" />{t("Add Schedule")}</Button>
          <div className="flex gap-0.5 rounded-xl bg-foreground/[.04] p-[3px]" role="group" aria-label={t("View")}>
            {(["day", "week", "month"] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-[10px] px-3.5 py-1.5 text-[13px] font-semibold ${view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{v === "day" ? t("Daily") : v === "week" ? t("Weekly") : t("Monthly")}</button>)}
          </div>
          </div>
        </div>
        <div role="grid" aria-label={title} className={`grid ${view === "day" ? "grid-cols-1" : "grid-cols-7"} ${view === "month" ? "" : ""}`}>
          {view !== "day" && DOW.map((d) => <div key={d} role="columnheader" className="border-b border-border p-2.5 text-center text-[11px] font-extrabold uppercase tracking-[.12em] text-gold">{t(d)}</div>)}
          {days.map((d) => {
            const k = ymd(d);
            const list = byDate.get(k) ?? [];
            const ev = gOn(k);
            const isBlocked = blocked.has(k);
            const out = view === "month" && d.getMonth() !== focus.getMonth();
            return (
              <div
                key={k} role="gridcell" tabIndex={0}
                aria-label={`${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${isBlocked ? ", blocked" : ""}${list.length ? `, ${list.length} booking${list.length > 1 ? "s" : ""}` : ""}${itemsByDate.get(k)?.length ? `, ${itemsByDate.get(k)?.length} schedule` : ""}`}
                onClick={() => clickDay(d)} onDoubleClick={() => openDay(d)}
                onKeyDown={(e) => { if (e.key === "Enter") openDay(d); else if (e.key === " ") { e.preventDefault(); void toggleBlock(k); } }}
                className={`relative flex cursor-pointer flex-col gap-1 border-b border-e border-border p-2 text-start outline-none transition-colors hover:bg-foreground/[.03] focus-visible:shadow-[inset_0_0_0_2px_var(--gold)] ${view === "month" ? "min-h-[112px]" : view === "week" ? "min-h-[260px]" : "min-h-[300px]"} ${out ? "opacity-35" : ""} ${isBlocked ? "bg-[repeating-linear-gradient(135deg,rgba(226,87,76,.1)_0_8px,rgba(226,87,76,.04)_8px_16px)]" : ""}`}
              >
                <span className={`grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold ${k === today ? "bg-gradient-gold text-gold-foreground" : ""}`}>{d.getDate()}</span>
                {isBlocked && <span className="self-start rounded-md border border-red-400/30 bg-red-500/15 px-1.5 py-0.5 text-[10.5px] font-extrabold text-red-300">{t("Unavailable")}</span>}
                {list.map((b) => (
                  <button key={b.id} type="button" title={`${b.client_name} · ${b.package_title}`} onClick={(e) => { e.stopPropagation(); setOpen(b); }}
                    className={`overflow-hidden text-ellipsis rounded-[7px] border-s-[3px] px-2 py-0.5 text-start text-[11.5px] font-bold transition-[background,translate] hover:translate-x-0.5 ${stageClasses(b).entry} ${view === "month" ? "whitespace-nowrap" : "whitespace-normal py-1.5 text-xs"}`}>
                    {view === "month" && b.start_time && <small className="me-1 font-semibold text-muted-foreground">{hhmm(b.start_time)}</small>}
                    {b.client_name}
                    {view !== "month" && <small className="block font-semibold text-muted-foreground">{b.start_time ? `${hhmm(b.start_time)} – ${hhmm(b.end_time)} · ` : ""}{b.package_title}</small>}
                    {view !== "month" && <small className="block text-[10px] font-extrabold uppercase tracking-wider opacity-80">{t(STAGE_LABEL[bookingStage(b)])}</small>}
                  </button>
                ))}
                {(itemsByDate.get(k) ?? []).map((i) => (
                  <button key={i.id} type="button" title={i.title} onClick={(e) => { e.stopPropagation(); setItem(i); }}
                    className={`overflow-hidden text-ellipsis rounded-[7px] border-s-[3px] border-violet-400 bg-violet-400/15 px-2 py-0.5 text-start text-[11.5px] font-bold transition-[background,translate] hover:translate-x-0.5 hover:bg-violet-400/25 ${view === "month" ? "whitespace-nowrap" : "whitespace-normal py-1.5 text-xs"}`}>
                    <small className="me-1 font-semibold text-muted-foreground">{hhmm(i.start_time)}</small>{i.title}
                    {view !== "month" && <small className="block font-semibold text-muted-foreground">{hhmm(i.start_time)} – {hhmm(i.end_time)}{i.notes ? ` · ${i.notes}` : ""}</small>}
                  </button>
                ))}
                {ev.slice(0, view === "month" ? 2 : 8).map((e) => <div key={e.id + k} className="truncate rounded-[7px] border-s-[3px] border-blue-400 bg-blue-400/10 px-2 py-0.5 text-[11px]">{e.allDay ? "" : `${hm(e.start)} `}{e.title}</div>)}
                {view !== "month" && list.length === 0 && ev.length === 0 && !(itemsByDate.get(k)?.length) && <span className="text-xs font-medium text-muted-foreground/60">{t("No bookings")}</span>}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-4 px-5 py-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2"><i className="h-3 w-3 rounded bg-zinc-400/60" />{t("Soft Booking")}</span>
          <span className="flex items-center gap-2"><i className="h-3 w-3 rounded bg-gold/40" />{t("Job Booking (down payment)")}</span>
          <span className="flex items-center gap-2"><i className="h-3 w-3 rounded bg-gold/80" />{t("Job Booking (paid in full)")}</span>
          <span className="flex items-center gap-2"><i className="h-3 w-3 rounded bg-emerald-400/70" />{t("Job Complete")}</span>
          <span className="flex items-center gap-2"><i className="h-3 w-3 rounded bg-violet-400/60" />{t("My schedule")}</span>
          <span className="flex items-center gap-2"><i className="h-3 w-3 rounded bg-red-500/35" />{t("Blocked (clients can't book)")}</span>
          <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-gradient-gold" />{t("Today")}</span>
        </div>
      </section>

      <section className="dmr-panel dmr-q-panel dmr-c-12" aria-label={t("Scheduled events")}>
        <div className="dmr-q-tools">
          <div className="me-auto"><h2 className="font-display text-[28px] leading-none">{t("Schedule")}</h2><small className="text-xs text-muted-foreground">{t("Sorted by event date")}</small></div>
          <label className="relative flex max-w-md flex-1 basis-64 items-center">
            <Search className="pointer-events-none absolute start-3.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">{t("Search schedule")}</span>
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={t("Search client, event, location")} className="h-10 w-full rounded-full border border-border bg-foreground/[.04] pe-4 ps-10 text-sm outline-none focus-visible:border-gold" />
          </label>
          <div className="flex gap-0.5 rounded-xl bg-foreground/[.04] p-[3px]" role="group" aria-label={t("Filter by progress")}>
            {([["all", "All"], ["waiting", "Waiting"], ["done", "Done"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => { setTab(k); setPage(0); }} className={`rounded-[10px] px-3.5 py-1.5 text-[13px] font-semibold ${tab === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{t(l)} <span className="opacity-60">{counts[k]}</span></button>)}
          </div>
        </div>
        <BulkBar count={selection.sel.length} busy={hide.busy} onClear={selection.clear} onDelete={() => void hide.run(selection.sel, "bookings")} />
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[1320px] border-separate border-spacing-0 text-[13.5px]">
            <thead><tr><th scope="col" className={`${th} w-10`}><RowCheckbox label={t("Select all")} checked={deletableOnPage.length > 0 && deletableOnPage.every((b) => selection.has(b.id))} disabled={deletableOnPage.length === 0} onChange={(on) => selection.toggleAll(deletableOnPage.map((b) => b.id), on)} /></th>{["Client name", "Event name", "Status", "Location", "Date event", "Start event", "End event", "Duration perform", "Payment", "Job detail", "Progress"].map((h) => <th key={h} scope="col" className={th}>{t(h)}</th>)}</tr></thead>
            <tbody>
              {pageRows.length === 0 && <tr><td colSpan={12} className="p-10 text-center text-muted-foreground"><b className="block font-display text-2xl">{jobsQ.isPending ? t("Loading…") : t("Nothing scheduled")}</b>{!jobsQ.isPending && t("Confirmed bookings and sent offers appear here by date.")}</td></tr>}
              {pageRows.map((b) => {
                const ps = payState(b);
                const loc = locationOf(b.notes);
                const dm = durationMin(b.start_time, b.end_time, b.notes);
                const muted = <span className="text-muted-foreground/60">{t("Not set")}</span>;
                return (
                  <tr key={b.id} className="transition-colors hover:bg-foreground/[.03]">
                    <td className={td}><RowCheckbox label={`${t("Select")} ${b.client_name}`} checked={selection.has(b.id)} disabled={!bookingDeletable(b)} title={bookingDeletable(b) ? undefined : t(NOT_DELETABLE)} onChange={(on) => selection.toggle(b.id, on)} /></td>
                    <td className={td}><b>{b.client_name}</b></td>
                    <td className={td}>{b.package_title}</td>
                    <td className={td}><span className={`${CHIP} min-w-[104px] ${stageClasses(b).chip}`}>{t(STAGE_LABEL[bookingStage(b)])}</span></td>
                    <td className={td}>{loc || muted}</td>
                    <td className={td}><b>{fmtDate(b.event_date)}</b></td>
                    <td className={td}>{hhmm(b.start_time) || muted}</td>
                    <td className={td}>{hhmm(b.end_time) || muted}</td>
                    <td className={`${td} font-bold`}>{dm == null ? muted : fmtDur(dm)}</td>
                    <td className={td}><span className={`${CHIP} ${PAY_STYLE[ps]}`}>{t(ps === "paid" ? "Paid" : ps === "partial" ? "Partially paid" : "Unpaid")}</span></td>
                    <td className={`${td} !whitespace-normal min-w-[200px] max-w-[260px] text-[12.5px] text-muted-foreground`}>{b.job_detail || muted}</td>
                    <td className={td}>
                      <div className="inline-flex rounded-full border border-border bg-foreground/[.05] p-[3px]" role="group" aria-label={`${t("Progress for")} ${b.client_name}`}>
                        <button type="button" aria-pressed={done(b)} onClick={() => void markDone(b)} className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${done(b) ? "bg-emerald-400/20 text-emerald-300" : "text-muted-foreground hover:text-foreground"}`}>{t("Done")}</button>
                        <button type="button" aria-pressed={!done(b)} disabled className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${!done(b) ? "bg-gradient-gold text-gold-foreground" : "text-muted-foreground"}`}>{t("Waiting")}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="dmr-q-foot flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">{t("Rows per page")}
            <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className="h-8 rounded-md border border-border bg-transparent px-2 text-xs">{[5, 10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <span className="text-xs text-muted-foreground">{rows.length === 0 ? "0" : `${cur * size + 1}–${Math.min(rows.length, cur * size + size)}`} {t("of")} {rows.length}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={cur === 0} onClick={() => setPage(cur - 1)}>{t("Prev")}</Button><Button size="sm" variant="outline" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>{t("Next")}</Button></div>
        </div>
      </section>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-lg rounded-[24px] border-border bg-gradient-to-b from-[#141a2e] to-[#0c1120]">
          <DialogHeader className="text-start"><DialogTitle className="font-display text-3xl font-normal">{t("Add")} <span className="it">{t("schedule")}</span></DialogTitle><DialogDescription>{t("A private entry on your calendar. Clients do not see it.")}</DialogDescription></DialogHeader>
          <form className="grid gap-3.5" onSubmit={(e) => { e.preventDefault(); void saveItem(); }}>
            <div className="space-y-2"><Label htmlFor="sch-title">{t("Title")}</Label><Input id="sch-title" maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("e.g. Rehearsal, studio session")} autoFocus /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2"><Label htmlFor="sch-date">{t("Date")}</Label><Input id="sch-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="sch-start">{t("Start time")}</Label><Input id="sch-start" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="sch-end">{t("End time")}</Label><Input id="sch-end" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="sch-notes">{t("Description")}</Label><Textarea id="sch-notes" rows={3} maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" className="rounded-full" onClick={() => setAdding(false)}>{t("Cancel")}</Button><Button type="submit" disabled={saving} className="rounded-full bg-gradient-gold font-bold text-gold-foreground">{t(saving ? "Saving…" : "Save schedule")}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!item} onOpenChange={(o) => { if (!o) setItem(null); }}>
        <DialogContent className="max-w-md rounded-[24px] border-border bg-gradient-to-b from-[#141a2e] to-[#0c1120]">
          {item && (
            <>
              <DialogHeader className="text-start"><DialogTitle className="font-display text-3xl font-normal">{item.title}</DialogTitle><DialogDescription>{fmtDate(item.event_date)} · {hhmm(item.start_time)} – {hhmm(item.end_time)}</DialogDescription></DialogHeader>
              <p className={`whitespace-pre-wrap break-words text-sm ${item.notes ? "" : "text-muted-foreground/60"}`}>{item.notes || t("No description")}</p>
              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" className="rounded-full border-red-400/40 text-red-300 hover:bg-red-500/10" onClick={() => void removeItem(item)}><Trash2 className="me-1.5 h-4 w-4" />{t("Delete")}</Button>
                <Button variant="outline" className="rounded-full" onClick={() => setItem(null)}>{t("Close")}</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="max-w-lg rounded-[24px] border-border bg-gradient-to-b from-[#141a2e] to-[#0c1120]">
          {open && (
            <>
              <DialogHeader className="text-start"><DialogTitle className="font-display text-3xl font-normal">{open.client_name} · {open.package_title}</DialogTitle><DialogDescription>{fmtDate(open.event_date)}{open.start_time ? ` · ${hhmm(open.start_time)} – ${hhmm(open.end_time)}` : ""}</DialogDescription></DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <span className={`${CHIP} min-w-[104px] ${stageClasses(open).chip}`}>{t(STAGE_LABEL[bookingStage(open)])}</span>
                <span aria-label={`${t("Payment")}: ${payState(open)}`} className={`inline-flex -rotate-3 flex-col items-center rounded-[10px] border-[3px] border-double border-current px-3.5 py-1 ${STAMP[payState(open)]}`}><b className="text-[15px] font-black leading-none tracking-[.14em]">{payState(open) === "paid" ? "PAID" : payState(open) === "partial" ? "PARTIAL" : "UNPAID"}</b><i className="text-[9px] font-bold not-italic tracking-[.12em]">{payState(open) === "unpaid" ? `AED ${Number(open.total).toLocaleString("en-US")}` : `AED ${Number(open.paid_amount).toLocaleString("en-US")} / ${Number(open.total).toLocaleString("en-US")}`}</i></span>
              </div>
              <dl className="grid grid-cols-[130px_1fr] text-sm">
                {([["Location", locationOf(open.notes) || null], ["Duration perform", durationMin(open.start_time, open.end_time, open.notes) == null ? null : fmtDur(durationMin(open.start_time, open.end_time, open.notes))], ["Total", aed(Number(open.total))], ["Paid", aed(Number(open.paid_amount))], ["Job detail", open.job_detail]] as const).map(([k, v]) => (
                  <div key={k} className="contents"><dt className="border-b border-border py-3 text-[11px] font-extrabold uppercase tracking-[.1em] text-muted-foreground">{t(k)}</dt><dd className={`whitespace-pre-wrap break-words border-b border-border py-3 ${v ? "" : "text-muted-foreground/60"}`}>{v ?? t("Not set")}</dd></div>
                ))}
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="outline" className="rounded-full border-red-400/40 text-red-300 hover:bg-red-500/10" disabled={!bookingDeletable(open) || hide.busy} title={bookingDeletable(open) ? undefined : t(NOT_DELETABLE)} onClick={() => { void hide.run([open.id], "bookings").then((ok) => { if (ok) setOpen(null); }); }}><Trash2 className="me-1.5 h-4 w-4" />{t("Delete")}</Button>
                <Button variant="outline" className="rounded-full" onClick={() => setOpen(null)}>{t("Close")}</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
