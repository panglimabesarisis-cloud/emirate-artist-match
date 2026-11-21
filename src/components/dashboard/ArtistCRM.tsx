import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Calendar, ChevronLeft, ChevronRight, FileSignature, Inbox as InboxIcon, Lock, Sparkles, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { completeCalendarConnect, disconnectCalendar, getCalendarEvents, startCalendarConnect } from "@/lib/calendar.functions";
import { aed } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { maskIban, useBankDetails } from "./useBankDetails";
import { OverviewPlan, PlanDialogs, type PlanModal } from "./OverviewPlan";
import { DashboardArtwork } from "./DashboardArtwork";
import { StudioHeading, StudioSection, StudioSoon, StudioEmpty, StudioDonut } from "./StudioPage";

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function ArtistOverview({ artistId, stageName, plan, onOpen }: { artistId: string; stageName: string; plan: string; onOpen: (section: string) => void }) {
  const { t } = useI18n();
  const [modal, setModal] = useState<PlanModal>(null);
  const { data } = useQuery({
    queryKey: ["artist-overview", artistId],
    queryFn: async () => {
      const [b, q, w, c] = await Promise.all([
        supabase.from("bookings").select("status, amount, event_date").eq("artist_id", artistId),
        supabase.from("quote_requests").select("id", { count: "exact", head: true }).eq("artist_id", artistId).eq("status", "new"),
        supabase.rpc("artist_wallet", { _artist: artistId }),
        supabase.from("credit_wallets").select("balance").eq("artist_id", artistId).maybeSingle(),
      ]);
      return { bookings: b.data ?? [], newQuotes: q.count ?? 0, wallet: w.data?.[0], credits: c.data?.balance ?? 0 };
    },
  });
  const chart = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1); return { key: d.toISOString().slice(0, 7), label: d.toLocaleString("en-GB", { month: "short" }), earned: 0 }; });
    for (const b of data?.bookings ?? []) if (b.status === "completed") { const m = months.find((x) => x.key === b.event_date.slice(0, 7)); if (m) m.earned += Number(b.amount); }
    return months;
  }, [data]);
  const upcoming = (data?.bookings ?? []).filter((b) => b.status === "confirmed").length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("Good morning") : hour < 18 ? t("Good afternoon") : t("Good evening");
  const planName = plan.charAt(0).toUpperCase() + plan.slice(1);
  const quick = "studio-button";
  return (
    <div className="studio-overview">
      <section className="studio-hello studio-span-12" aria-labelledby="ov-hello">
        <DashboardArtwork />
        <div className="studio-greeting">
          <small>{t(new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }))}</small>
          <h1 id="ov-hello">{greeting}, <span className="it">{stageName}.</span></h1>
          <p>{t("Every new enquiry is answered by your AI agent, and you will see confirmed bookings here first.")}</p>
        </div>
        <div className="studio-quick">
          <Button variant="outline" className={quick} onClick={() => setModal("plan")}>{t("Your plan is")} <b>{t(planName)}</b></Button>
          <Button variant="outline" className={quick} onClick={() => setModal("upgrade")}>{t("Upgrade plan")}</Button>
          <Button variant="outline" className={quick} onClick={() => setModal("topup")}>{t("Top up credits")}</Button>
        </div>
      </section>
      <article className="studio-kpi studio-span-3">
        <span className="studio-kpi-label"><span className="studio-kpi-icon"><Wallet aria-hidden="true" /></span>{t("Available balance")}</span>
        <div className="studio-kpi-value" dir="ltr"><small>{t("AED")}</small>{Number(data?.wallet?.available ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div className="studio-kpi-action"><span>{t("Ready to withdraw")}</span><Button variant="outline" size="sm" className="studio-button" onClick={() => onOpen("wallet")}>{t("Open Wallet")}</Button></div>
      </article>
      <article className="studio-kpi studio-span-3">
        <span className="studio-kpi-label"><span className="studio-kpi-icon"><FileSignature aria-hidden="true" /></span>{t("Jobs completed")}</span>
        <div className="studio-kpi-value">{data?.wallet?.jobs ?? 0}</div>
        <div className="studio-kpi-action"><span>{t("Completed bookings release your payment")}</span></div>
      </article>
      <article className="studio-kpi studio-span-3">
        <span className="studio-kpi-label"><span className="studio-kpi-icon"><Calendar aria-hidden="true" /></span>{t("Upcoming bookings")}</span>
        <div className="studio-kpi-value">{upcoming}</div>
        <div className="studio-kpi-action"><span>{data?.newQuotes ?? 0} {t("new quote requests")}</span><Button variant="link" className="studio-text-link" onClick={() => onOpen("quotes")}>{t("Open")} <span aria-hidden="true">→</span></Button></div>
      </article>
      <article className="studio-kpi studio-kpi-gold studio-span-3">
        <span className="studio-kpi-label"><span className="studio-kpi-icon"><Sparkles aria-hidden="true" /></span>{t("AI credits")}</span>
        <svg className="studio-credit-gauge" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" /><circle className="studio-gauge-accent" cx="50" cy="50" r="40" /><Sparkles x="38" y="38" width="24" height="24" /></svg>
        <div className="studio-kpi-value">{data?.credits ?? 0}</div>
        <div className="studio-kpi-action"><span>{t(planName)} {t("plan")}</span><Button variant="link" className="studio-text-link" onClick={() => setModal("topup")}>{t("Top up")} <span aria-hidden="true">→</span></Button></div>
      </article>
      <section className="studio-panel studio-earnings studio-span-8" aria-labelledby="ov-earnings">
        <div className="studio-panel-heading"><h2 id="ov-earnings">{t("Earnings")} <span className="it">{t("over time")}</span><small>{t("Last 6 months, in AED")}</small></h2><span className="studio-range">{t("6 months")}</span></div>
        <div className="studio-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}><CartesianGrid stroke="var(--studio-line)" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="label" tickFormatter={(v: string) => t(v)} fontSize={11} stroke="var(--studio-mute-2)" tickLine={false} axisLine={false} /><YAxis fontSize={11} stroke="var(--studio-mute-2)" tickLine={false} axisLine={false} width={44} /><Tooltip formatter={(v) => aed(Number(v))} labelFormatter={(v) => t(String(v))} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "var(--studio-tooltip-radius)", color: "var(--foreground)" }} /><Bar dataKey="earned" name={"Earnings"} fill="var(--chart-1)" radius={[6, 6, 0, 0]} /></BarChart>
          </ResponsiveContainer>
          {chart.every((m) => m.earned === 0) && <div className="studio-chart-empty"><b>{t("No earnings")} <span className="it">{t("yet.")}</span></b><p>{t("Your first completed booking appears here. Payments are released after each job is done.")}</p><Button className="studio-button studio-button-gold" onClick={() => onOpen("profile")}>{t("Share your profile")} <span aria-hidden="true">→</span></Button></div>}
        </div>
        <Button variant="link" className="studio-text-link studio-wallet-link" onClick={() => onOpen("wallet")}>{t("Open Wallet")}</Button>
      </section>
      <OverviewPlan artistId={artistId} stageName={stageName} plan={plan} openModal={setModal} />
      <section className="studio-panel studio-span-4">
        <div className="studio-panel-heading"><h2>{t("Upcoming")}</h2><Button variant="link" className="studio-text-link" onClick={() => onOpen("calendar")}>{t("Calendar")} <span aria-hidden="true">→</span></Button></div>
        <div className="studio-zero"><span className="studio-orb"><Calendar aria-hidden="true" /></span><b>{upcoming > 0 ? `${upcoming} ${t("Upcoming bookings")}` : t("Nothing booked yet")}</b><p>{t("Confirmed bookings show here with date, venue and deposit status.")}</p></div>
      </section>
      <section className="studio-panel studio-span-4">
        <div className="studio-panel-heading"><h2>{t("Inbox")}</h2><Button variant="link" className="studio-text-link" onClick={() => onOpen("inbox")}>{t("Open")} <span aria-hidden="true">→</span></Button></div>
        <div className="studio-zero"><span className="studio-orb"><InboxIcon aria-hidden="true" /></span><b>{data?.newQuotes ? `${data.newQuotes} ${t("new quote requests")}` : t("Quote requests")}</b><p>{t("Your AI agent answers new enquiries and hands over real bookings to you.")}</p></div>
      </section>
      <section className="studio-panel studio-span-4">
        <div className="studio-panel-heading"><h2>{t("AI")} <span className="it">{t("agent")}</span></h2><Button variant="link" className="studio-text-link" onClick={() => onOpen("agent")}>{t("Settings")}</Button></div>
        <div className="studio-agent"><span className="studio-pulse"><Bot aria-hidden="true" /></span><div><b>{t("AI agent")}</b><p>{t("Replies in English and Arabic using your rate card.")}</p></div></div>
        <div className="studio-agent-divider" />
        <p className="studio-agent-credits"><b>{data?.credits ?? 0}</b> {t("credits left · each AI reply uses 1 credit")}</p>
      </section>
      <PlanDialogs artistId={artistId} plan={plan} open={modal} setOpen={setModal} />
    </div>
  );
}

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

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarTab({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const start$ = useServerFn(startCalendarConnect), complete$ = useServerFn(completeCalendarConnect), events$ = useServerFn(getCalendarEvents), disc$ = useServerFn(disconnectCalendar);
  const [view, setView] = useState<"day" | "week" | "month">("month");
  const [focus, setFocus] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); });
  const cursor = useMemo(() => new Date(focus.getFullYear(), focus.getMonth(), 1), [focus]);
  const shift = (dir: number) => setFocus(view === "month" ? new Date(focus.getFullYear(), focus.getMonth() + dir, 1) : new Date(focus.getFullYear(), focus.getMonth(), focus.getDate() + dir * (view === "week" ? 7 : 1)));
  const weekDays = useMemo(() => { const s = new Date(focus.getFullYear(), focus.getMonth(), focus.getDate() - ((focus.getDay() + 6) % 7)); return Array.from({ length: 7 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i)); }, [focus]);
  const title = view === "month" ? cursor.toLocaleString("en-GB", { month: "long", year: "numeric" })
    : view === "week" ? `${weekDays[0]!.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${weekDays[6]!.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
    : focus.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const month = ymd(cursor).slice(0, 7);
  const [busy, setBusy] = useState(false);
  const g = useQuery({ queryKey: ["gcal", month], queryFn: () => events$({ data: { month } }), retry: false });
  const local = useQuery({
    queryKey: ["cal-local", artistId, month],
    queryFn: async () => {
      const from = `${month}-01`, to = ymd(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
      const [a, b] = await Promise.all([
        supabase.from("availability").select("id, date, note").eq("artist_id", artistId).gte("date", from).lte("date", to),
        supabase.from("bookings").select("id, event_date, client_name, package_title, status").eq("artist_id", artistId).in("status", ["confirmed", "completed", "quoted", "inquiry"]).gte("event_date", from).lte("event_date", to),
      ]);
      return { blocked: a.data ?? [], bookings: b.data ?? [] };
    },
  });

  const connect = async () => {
    const popup = window.open("", "lovable-oauth", "width=600,height=720");
    if (!popup) { toast.error(t("Popup blocked. Allow popups and try again.")); return; }
    setBusy(true);
    try {
      const { authorizationUrl } = await start$();
      const done = waitForOAuth(popup);
      popup.location.href = authorizationUrl;
      const code = await done;
      if (code) await complete$({ data: { code } });
      await qc.invalidateQueries({ queryKey: ["gcal"] });
      toast.success(g.data?.connected ? "Reconnected to Google Calendar" : "Google Calendar connected");
    } catch (e) { popup.close(); toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!confirm(t("Disconnect Google Calendar?"))) return;
    try { await disc$(); await qc.invalidateQueries({ queryKey: ["gcal"] }); toast.success(t("Google Calendar disconnected")); } catch (e) { toast.error((e as Error).message); }
  };
  const toggleBlock = async (date: string) => {
    const ex = local.data?.blocked.find((x) => x.date === date);
    const { error } = ex ? await supabase.from("availability").delete().eq("id", ex.id) : await supabase.from("availability").insert({ artist_id: artistId, date, note: "Unavailable" });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["cal-local", artistId] });
  };

  const days = useMemo(() => {
    const first = (cursor.getDay() + 6) % 7;
    const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))] as (Date | null)[];
  }, [cursor]);
  const gEventsOn = (date: string) => (g.data?.events ?? []).filter((e) => {
    if (e.allDay) return e.start <= date && date < e.end;
    return ymd(new Date(e.start)) <= date && date <= ymd(new Date(e.end));
  });
  const today = ymd(new Date());

  return (
    <div className="dmr-wrap dmr-cpage"><StudioHeading title="Calen" accent="dar" />
      <div className="studio-calendar-connect">
        <div>
          <div className="font-semibold">{t("Google Calendar")}</div>
          <div className="text-sm text-muted-foreground">
            {g.isLoading ? t("Checking…") : g.data?.connected ? `Connected${g.data.email ? ` · ${g.data.email}` : ""}. Your events show on the calendar below.` : g.data?.reconnectRequired ? t("Your Google Calendar access needs to be renewed.") : g.isError ? t("Couldn't load Google Calendar.") : t("Connect your Google Calendar so your events appear here.")}
          </div>
        </div>
        <div className="flex gap-2">
          {g.data?.connected ? <Button variant="outline" onClick={disconnect}>{t("Disconnect")}</Button>
            : <Button onClick={connect} disabled={busy}>{busy ? t("Connecting…") : g.data?.reconnectRequired ? t("Reconnect Google Calendar") : t("Connect Google Calendar")}</Button>}
        </div>
      </div>

      <StudioDonut title={t("Job progress")} entries={[{label:"Done",value:local.data?.bookings.filter(b=>b.status === "completed").length ?? 0},{label:"Waiting",value:local.data?.bookings.filter(b=>b.status !== "completed").length ?? 0}]} />
      <StudioSection title="Payment" accent="status" className="studio-donut-panel"><StudioSoon label="Calendar payment breakdown" /></StudioSection>
      <div className="dmr-panel studio-calendar-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label={t("Previous")} onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => { const d = new Date(); setFocus(new Date(d.getFullYear(), d.getMonth(), d.getDate())); }}>{t("Today")}</Button>
            <Button variant="ghost" size="icon" aria-label={t("Next")} onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="font-semibold">{title}</div>
          <div className="flex rounded-lg border p-0.5">
            {(["day", "week", "month"] as const).map((v) => (
              <Button variant="ghost" key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1 text-xs font-medium ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>{v === "day" ? t("Daily") : v === "week" ? t("Weekly") : t("Monthly")}</Button>
            ))}
          </div>
        </div>
        {view === "month" && <div className="overflow-x-auto">
        <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">{WEEK.map((w) => <div key={w} className="py-2">{w}</div>)}</div>
        <div className="grid grid-cols-7 studio-calendar-grid">
          {days.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="min-h-24 border-b border-e bg-muted/30" />;
            const date = ymd(d);
            const blocked = local.data?.blocked.find((x) => x.date === date);
            const bks = local.data?.bookings.filter((b) => b.event_date === date) ?? [];
            const ev = gEventsOn(date);
            return (
              <Button variant="ghost" key={date} onClick={() => toggleBlock(date)} onDoubleClick={() => { setFocus(d); setView("day"); }} title={blocked ? t("Click to unblock · double-click for day view") : t("Click to block · double-click for day view")}
                className={`studio-calendar-day ${blocked ? "bg-destructive/10" : ""}`}>
                <div className={`mb-1 inline-grid h-6 w-6 place-items-center rounded-full text-xs ${date === today ? "bg-primary text-primary-foreground" : ""}`}>{d.getDate()}</div>
                <div className="space-y-0.5">
                  {blocked && <div className="truncate rounded bg-destructive/20 px-1 text-[10px] text-destructive">{blocked.note ?? "Blocked"}</div>}
                  {bks.map((b) => <div key={b.id} className="truncate rounded bg-gold/25 px-1 text-[10px]">{b.client_name}</div>)}
                  {ev.slice(0, 3).map((e) => <div key={e.id + date} className="truncate rounded bg-primary/15 px-1 text-[10px]">{e.allDay ? "" : `${hm(e.start)} `}{e.title}</div>)}
                  {ev.length > 3 && <div className="text-[10px] text-muted-foreground">+{ev.length - 3} {t("more")}</div>}
                </div>
              </Button>
            );
          })}
        </div>
        </div>}
        {view !== "month" && (() => {
          const cols = view === "week" ? weekDays : [focus];
          return (
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid border-b" style={{ gridTemplateColumns: `56px repeat(${cols.length}, minmax(0,1fr))` }}>
                  <div />
                  {cols.map((d) => {
                    const date = ymd(d), blocked = local.data?.blocked.find((x) => x.date === date);
                    const allDay = gEventsOn(date).filter((e) => e.allDay), bks = local.data?.bookings.filter((b) => b.event_date === date) ?? [];
                    return (
                      <div key={date} className={`border-s p-1.5 text-xs ${blocked ? "bg-destructive/10" : ""}`}>
                        <Button variant="ghost" onClick={() => { setFocus(d); setView("day"); }} className={`font-medium ${date === today ? "text-primary" : ""}`}>{d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}</Button>
                        <div className="mt-1 space-y-0.5">
                          {blocked && <div className="truncate rounded bg-destructive/20 px-1 text-[10px] text-destructive">{blocked.note ?? "Blocked"}</div>}
                          {bks.map((b) => <div key={b.id} className="truncate rounded bg-gold/25 px-1 text-[10px]">{b.client_name}</div>)}
                          {allDay.map((e) => <div key={e.id} className="truncate rounded bg-primary/15 px-1 text-[10px]">{e.title}</div>)}
                          <Button variant="ghost" onClick={() => toggleBlock(date)} className="text-[10px] text-muted-foreground underline">{blocked ? t("Unblock") : t("Block day")}</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="relative grid max-h-[640px] overflow-y-auto" style={{ gridTemplateColumns: `56px repeat(${cols.length}, minmax(0,1fr))` }}>
                  <div>{HOURS.map((h) => <div key={h} className="h-12 border-b pe-1 text-end text-[10px] text-muted-foreground">{String(h).padStart(2, "0")}:00</div>)}</div>
                  {cols.map((d) => {
                    const date = ymd(d), dayStart = d.getTime();
                    const timed = gEventsOn(date).filter((e) => !e.allDay);
                    return (
                      <div key={date} className="relative border-s">
                        {HOURS.map((h) => <div key={h} className="h-12 border-b" />)}
                        {timed.map((e) => {
                          const s = Math.max(0, (new Date(e.start).getTime() - dayStart) / 3600000), en = Math.min(24, (new Date(e.end).getTime() - dayStart) / 3600000);
                          return (
                            <div key={e.id} className="absolute inset-x-1 overflow-hidden rounded bg-primary/20 px-1 text-[10px] leading-tight" style={{ top: s * 48, height: Math.max(18, (en - s) * 48) }}>
                              <div className="font-medium">{hm(e.start)}–{hm(e.end)}</div><div className="truncate">{e.title}</div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
      <div className="dmr-c-12 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-gold/40" /> {t("Dealmaker booking")}</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary/25" /> {t("Google Calendar")}</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-destructive/25" /> {t("Blocked (clients can't book)")}</span>
        <span>{t("Monthly: click a day to block it, double-click to open the daily view.")}</span>
      </div>
      <section className="dmr-panel dmr-q-panel dmr-c-12"><div className="dmr-q-tools"><h2>{t("Schedule")}</h2></div><div className="dmr-tbl-wrap"><table data-studio-table="true"><thead><tr>{["Date","Client","Service","Status","Location","Progress"].map(h=><th key={h}>{t(h)}</th>)}</tr></thead><tbody>{local.data?.bookings.map(b=><tr key={b.id}><td data-label={t("Date")}>{b.event_date}</td><td data-label={t("Client")}>{b.client_name}</td><td data-label={t("Service")}>{b.package_title}</td><td data-label={t("Status")}><Badge>{t(b.status)}</Badge></td><td data-label={t("Location")}><span className="studio-soon">{t("segera")}</span></td><td data-label={t("Progress")}><Badge>{t(b.status === "completed" ? "Done" : "Waiting")}</Badge></td></tr>)}</tbody></table></div>{!local.data?.bookings.length && <StudioEmpty title={t("Nothing scheduled")} icon={Calendar} />}</section>
    </div>
  );
}

const PHONE = /^\+?[0-9 ]{8,16}$/;
export function TeamPhones({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["team-phones", artistId], queryFn: async () => (await supabase.from("artists").select("notify_phone, manager_phone").eq("id", artistId).single()).data });
  const [artist, setArtist] = useState<string | null>(null), [manager, setManager] = useState<string | null>(null);
  const a = artist ?? data?.notify_phone ?? "", m = manager ?? data?.manager_phone ?? "";
  const save = async () => {
    if ((a && !PHONE.test(a)) || (m && !PHONE.test(m))) { toast.error(t("Enter valid WhatsApp numbers, e.g. +971 50 123 4567")); return; }
    const { error } = await supabase.from("artists").update({ notify_phone: a.replace(/\s/g, "") || null, manager_phone: m.replace(/\s/g, "") || null }).eq("id", artistId);
    if (error) { toast.error(error.message); return; }
    toast.success(t("WhatsApp numbers saved"));
    qc.invalidateQueries({ queryKey: ["team-phones", artistId] });
  };
  return (
    <div className="dmr-panel mt-5 space-y-4">
      <h2>{t("WhatsApp notifications")}</h2><p className="text-sm text-muted-foreground">{t("When a client pays, the full booking details (date, time, venue, package, client contact and amount) are sent to these WhatsApp numbers.")}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5"><Label>{t("Artist WhatsApp")}</Label><Input className="mt-2" value={a} onChange={(e) => setArtist(e.target.value)} placeholder="+971 50 123 4567" /></div>
        <div className="rounded-xl border bg-card p-5"><Label>{t("Manager WhatsApp")}</Label><Input className="mt-2" value={m} onChange={(e) => setManager(e.target.value)} placeholder="+971 55 765 4321" /></div>
      </div>
      <Button onClick={save} className="bg-gradient-gold text-gold-foreground">{t("Save numbers")}</Button>
    </div>
  );
}

export function WalletTab({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["wallet-pay", artistId],
    queryFn: async () => {
      const [w, r, j] = await Promise.all([
        supabase.rpc("artist_wallet", { _artist: artistId }),
        supabase.from("payout_requests").select("*").eq("artist_id", artistId).order("created_at", { ascending: false }),
        supabase.from("bookings").select("id, event_date, client_name, package_title, amount, invoice_no").eq("artist_id", artistId).eq("status", "completed").order("event_date", { ascending: false }).limit(20),
      ]);
      if (w.error) throw w.error;
      return { w: w.data?.[0], requests: r.data ?? [], jobs: j.data ?? [] };
    },
  });
  const { t } = useI18n();
  const [amount, setAmount] = useState(""), [bank, setBank] = useState(""), [busy, setBusy] = useState(false);
  const w = data?.w;
  const pct = Number(w?.commission_pct ?? 0);
  const locked = useBankDetails(artistId).data ?? null;
  const bankText = locked ? `${locked.bank_name}
${locked.account_holder}
${locked.iban}` : bank.trim();
  const request = async () => {
    const n = Number(amount);
    if (!(n > 0)) { toast.error(t("Enter an amount")); return; }
    if (n > Number(w?.available ?? 0)) { toast.error(t("Amount is more than your available balance")); return; }
    if (bankText.length < 8) { toast.error(t("Enter your bank name, account holder and IBAN")); return; }
    setBusy(true);
    const { error } = await supabase.from("payout_requests").insert({ artist_id: artistId, amount: n, bank_details: bankText });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setAmount(""); toast.success(t("Withdrawal requested. Our team will process it."));
    qc.invalidateQueries({ queryKey: ["wallet-pay", artistId] });
  };
  return (
    <div className="dmr-wrap dmr-wpage"><StudioHeading title="Wal" accent="let" />
      <div className="studio-wallet-hero"><div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">{t("Available to withdraw")}</div>
        <div className="mt-2 font-display text-5xl text-primary" dir="ltr">{aed(Number(w?.available ?? 0))}</div>
        <p className="mt-1 text-sm text-muted-foreground">{t("After platform fee, withdrawals and pending requests.")}</p>
<Button asChild className="mt-5"><a href="#studio-withdrawal">{t("Request withdrawal")}</a></Button></div><div className="studio-wallet-process"><span>{t("Client pays")}</span><span aria-hidden="true">→</span><span>{t("Escrow")}</span><span aria-hidden="true">→</span><span>{t("You withdraw")}</span></div></div>
      <div className="studio-wallet-stats">
        <Kpi label={t("Completed work")} value={aed(Number(w?.gross ?? 0))} hint={`${w?.jobs ?? 0} ${t("jobs, excl. VAT")}`} />
        <Kpi label={`${t("Platform fee")} (${pct}%)`} value={`- ${aed(Number(w?.fee ?? 0))}`} hint={t("Based on your plan")} />
        <Kpi label={t("Withdrawn / pending")} value={aed(Number(w?.paid_out ?? 0) + Number(w?.pending ?? 0))} hint={`${aed(Number(w?.pending ?? 0))} ${t("pending")}`} />
      </div>
      <div className="dmr-w-left">
        <div className="space-y-6">
          <section className="dmr-panel dmr-q-panel"><div className="dmr-q-tools"><h2>{t("Job")} <span className="it">{t("earnings")}</span></h2></div><div className="dmr-tbl-wrap"><table data-studio-table="true"><thead><tr>{["Job","Date","Job fee"].map(h=><th key={h}>{t(h)}</th>)}</tr></thead><tbody>{data?.jobs.map(j=><tr key={j.id}><td data-label={t("Job")}><b>{j.client_name}</b><small className="block text-muted-foreground">{j.package_title ?? t("Booking")}</small></td><td data-label={t("Date")}>{j.event_date}</td><td data-label={t("Job fee")}>{aed(Number(j.amount))}</td></tr>)}</tbody></table></div>{data?.jobs.length === 0 && <StudioEmpty title={t("No completed jobs yet.")} icon={Wallet} />}</section>
          <section className="dmr-panel dmr-q-panel"><div className="dmr-q-tools"><h2>{t("Withdrawal")} <span className="it">{t("requests")}</span></h2></div><div className="dmr-tbl-wrap"><table data-studio-table="true"><thead><tr>{["Requested","Amount","Status"].map(h=><th key={h}>{t(h)}</th>)}</tr></thead><tbody>{data?.requests.map(r=><tr key={r.id}><td data-label={t("Requested")}>{new Date(r.created_at).toLocaleDateString("en-GB")}{r.admin_note && <small className="block">{r.admin_note}</small>}</td><td data-label={t("Amount")}>{aed(Number(r.amount))}</td><td data-label={t("Status")}><Badge variant={r.status === "paid" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{t(r.status)}</Badge></td></tr>)}</tbody></table></div>{data?.requests.length === 0 && <StudioEmpty title={t("No withdrawals yet.")} icon={Wallet} />}</section></div></div>
        <div className="dmr-w-side"><div id="studio-withdrawal" className="dmr-panel">

          <div className="font-semibold">{t("Request withdrawal")}</div>
          <p className="mt-1 text-sm text-muted-foreground">{t("Demo mode: no real money is transferred.")}</p>
          <Label className="mt-4 block">{t("Amount (AED)")}</Label>
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Button variant="ghost" type="button" className="mt-1 text-xs underline text-muted-foreground" onClick={() => setAmount(String(Math.floor(Number(w?.available ?? 0))))}>{t("Withdraw all")}</Button>
          <Label className="mt-3 block">{t("Bank details")}</Label>
          {locked ? (
            <div className="mt-1 space-y-1 rounded-lg border bg-muted/40 p-3 text-sm" aria-label={t("Locked bank details")}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" />{t("Locked. Change it in Account settings.")}</div>
              <div className="font-medium">{locked.bank_name}</div><div>{locked.account_holder}</div><div dir="ltr">{maskIban(locked.iban)}</div>
            </div>
          ) : (
            <Textarea rows={3} maxLength={300} value={bank} onChange={(e) => setBank(e.target.value)} placeholder={t("Bank name\nAccount holder\nIBAN AE00 0000 0000 0000 0000 000")} />
          )}
          <Button className="mt-4 w-full bg-gradient-gold text-gold-foreground" disabled={busy} onClick={request}>{busy ? t("Sending…") : t("Request withdrawal")}</Button>
        </div><StudioSection title="How your money" accent="moves"><ol className="space-y-4 list-decimal ps-5 text-sm text-muted-foreground"><li>{t("Client pays into escrow")}</li><li>{t("Completed bookings release your payment")}</li><li>{t("You withdraw")}</li></ol></StudioSection>
      </div>
    </div>
  );
}
