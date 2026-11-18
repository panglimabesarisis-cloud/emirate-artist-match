import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { completeCalendarConnect, disconnectCalendar, getCalendarEvents, startCalendarConnect } from "@/lib/calendar.functions";
import { aed } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function ArtistOverview({ artistId }: { artistId: string }) {
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
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Available balance" value={aed(Number(data?.wallet?.available ?? 0))} hint="Ready to withdraw" />
        <Kpi label="Jobs completed" value={String(data?.wallet?.jobs ?? 0)} />
        <Kpi label="Upcoming bookings" value={String(upcoming)} hint={`${data?.newQuotes ?? 0} new quote requests`} />
        <Kpi label="AI credits" value={String(data?.credits ?? 0)} />
      </div>
      <div className="rounded-xl border bg-card p-5">
        <div className="font-semibold">Earnings, last 6 months</div>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={12} /><YAxis fontSize={12} /><Tooltip formatter={(v) => aed(Number(v))} /><Bar dataKey="earned" fill="var(--chart-1)" radius={[6, 6, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
      </div>
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
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarTab({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const start$ = useServerFn(startCalendarConnect), complete$ = useServerFn(completeCalendarConnect), events$ = useServerFn(getCalendarEvents), disc$ = useServerFn(disconnectCalendar);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
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
    if (!popup) { toast.error("Popup blocked. Allow popups and try again."); return; }
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
    if (!confirm("Disconnect Google Calendar?")) return;
    try { await disc$(); await qc.invalidateQueries({ queryKey: ["gcal"] }); toast.success("Google Calendar disconnected"); } catch (e) { toast.error((e as Error).message); }
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <div>
          <div className="font-semibold">Google Calendar</div>
          <div className="text-sm text-muted-foreground">
            {g.isLoading ? "Checking…" : g.data?.connected ? `Connected${g.data.email ? ` · ${g.data.email}` : ""}. Your events show on the calendar below.` : g.data?.reconnectRequired ? "Your Google Calendar access needs to be renewed." : g.isError ? "Couldn't load Google Calendar." : "Connect your Google Calendar so your events appear here."}
          </div>
        </div>
        <div className="flex gap-2">
          {g.data?.connected ? <Button variant="outline" onClick={disconnect}>Disconnect</Button>
            : <Button onClick={connect} disabled={busy}>{busy ? "Connecting…" : g.data?.reconnectRequired ? "Reconnect Google Calendar" : "Connect Google Calendar"}</Button>}
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-3">
          <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="font-semibold">{cursor.toLocaleString("en-GB", { month: "long", year: "numeric" })}</div>
          <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">{WEEK.map((w) => <div key={w} className="py-2">{w}</div>)}</div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="min-h-24 border-b border-e bg-muted/30" />;
            const date = ymd(d);
            const blocked = local.data?.blocked.find((x) => x.date === date);
            const bks = local.data?.bookings.filter((b) => b.event_date === date) ?? [];
            const ev = gEventsOn(date);
            return (
              <button key={date} onClick={() => toggleBlock(date)} title={blocked ? "Click to unblock" : "Click to block this date"}
                className={`min-h-24 border-b border-e p-1.5 text-start align-top transition-colors hover:bg-accent/50 ${blocked ? "bg-destructive/10" : ""}`}>
                <div className={`mb-1 inline-grid h-6 w-6 place-items-center rounded-full text-xs ${date === today ? "bg-primary text-primary-foreground" : ""}`}>{d.getDate()}</div>
                <div className="space-y-0.5">
                  {blocked && <div className="truncate rounded bg-destructive/20 px-1 text-[10px] text-destructive">{blocked.note ?? "Blocked"}</div>}
                  {bks.map((b) => <div key={b.id} className="truncate rounded bg-gold/25 px-1 text-[10px]">{b.client_name}</div>)}
                  {ev.slice(0, 3).map((e) => <div key={e.id + date} className="truncate rounded bg-primary/15 px-1 text-[10px]">{e.allDay ? "" : `${new Date(e.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} `}{e.title}</div>)}
                  {ev.length > 3 && <div className="text-[10px] text-muted-foreground">+{ev.length - 3} more</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-gold/40" /> Dealmaker booking</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary/25" /> Google Calendar</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-destructive/25" /> Blocked (clients can't book)</span>
        <span>Click a day to block or unblock it.</span>
      </div>
    </div>
  );
}

const PHONE = /^\+?[0-9 ]{8,16}$/;
export function TeamPhones({ artistId }: { artistId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["team-phones", artistId], queryFn: async () => (await supabase.from("artists").select("notify_phone, manager_phone").eq("id", artistId).single()).data });
  const [artist, setArtist] = useState<string | null>(null), [manager, setManager] = useState<string | null>(null);
  const a = artist ?? data?.notify_phone ?? "", m = manager ?? data?.manager_phone ?? "";
  const save = async () => {
    if ((a && !PHONE.test(a)) || (m && !PHONE.test(m))) { toast.error("Enter valid WhatsApp numbers, e.g. +971 50 123 4567"); return; }
    const { error } = await supabase.from("artists").update({ notify_phone: a.replace(/\s/g, "") || null, manager_phone: m.replace(/\s/g, "") || null }).eq("id", artistId);
    if (error) { toast.error(error.message); return; }
    toast.success("WhatsApp numbers saved");
    qc.invalidateQueries({ queryKey: ["team-phones", artistId] });
  };
  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">When a client pays, the full booking details (date, time, venue, package, client contact and amount) are sent to these WhatsApp numbers.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5"><Label>Artist WhatsApp</Label><Input className="mt-2" value={a} onChange={(e) => setArtist(e.target.value)} placeholder="+971 50 123 4567" /></div>
        <div className="rounded-xl border bg-card p-5"><Label>Manager WhatsApp</Label><Input className="mt-2" value={m} onChange={(e) => setManager(e.target.value)} placeholder="+971 55 765 4321" /></div>
      </div>
      <Button onClick={save} className="bg-gradient-gold text-gold-foreground">Save numbers</Button>
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
  const [amount, setAmount] = useState(""), [bank, setBank] = useState(""), [busy, setBusy] = useState(false);
  const w = data?.w;
  const pct = Number(w?.commission_pct ?? 0);
  const request = async () => {
    const n = Number(amount);
    if (!(n > 0)) { toast.error("Enter an amount"); return; }
    if (n > Number(w?.available ?? 0)) { toast.error("Amount is more than your available balance"); return; }
    if (bank.trim().length < 8) { toast.error("Enter your bank name, account holder and IBAN"); return; }
    setBusy(true);
    const { error } = await supabase.from("payout_requests").insert({ artist_id: artistId, amount: n, bank_details: bank.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setAmount(""); toast.success("Withdrawal requested. Our team will process it.");
    qc.invalidateQueries({ queryKey: ["wallet-pay", artistId] });
  };
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Completed work" value={aed(Number(w?.gross ?? 0))} hint={`${w?.jobs ?? 0} jobs, excl. VAT`} />
        <Kpi label={`Platform fee (${pct}%)`} value={`- ${aed(Number(w?.fee ?? 0))}`} hint="Based on your plan" />
        <Kpi label="Withdrawn / pending" value={aed(Number(w?.paid_out ?? 0) + Number(w?.pending ?? 0))} hint={`${aed(Number(w?.pending ?? 0))} pending`} />
        <Kpi label="Available to withdraw" value={aed(Number(w?.available ?? 0))} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="rounded-xl border bg-card">
            <div className="border-b p-4 font-semibold">Withdrawal requests</div>
            {data?.requests.length === 0 && <p className="p-4 text-sm text-muted-foreground">No withdrawals yet.</p>}
            <div className="divide-y">{data?.requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <div><div className="font-medium">{aed(Number(r.amount))}</div><div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-GB")}{r.admin_note ? ` · ${r.admin_note}` : ""}</div></div>
                <Badge variant={r.status === "paid" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{r.status}</Badge>
              </div>
            ))}</div>
          </div>
          <div className="rounded-xl border bg-card">
            <div className="border-b p-4 font-semibold">Completed jobs</div>
            {data?.jobs.length === 0 && <p className="p-4 text-sm text-muted-foreground">No completed jobs yet.</p>}
            <div className="divide-y">{data?.jobs.map((j) => (
              <div key={j.id} className="grid grid-cols-[1fr_auto] gap-2 p-4 text-sm">
                <div className="min-w-0"><div className="truncate font-medium">{j.client_name} · {j.package_title ?? "Booking"}</div><div className="text-xs text-muted-foreground">{j.event_date}{j.invoice_no ? ` · ${j.invoice_no}` : ""}</div></div>
                <div className="text-end"><div>{aed(Number(j.amount))}</div><div className="text-xs text-muted-foreground">net {aed(Number(j.amount) * (1 - pct / 100))}</div></div>
              </div>
            ))}</div>
          </div>
        </div>
        <div className="h-fit rounded-xl border bg-card p-5">
          <div className="font-semibold">Request withdrawal</div>
          <p className="mt-1 text-sm text-muted-foreground">Demo mode: no real money is transferred.</p>
          <Label className="mt-4 block">Amount (AED)</Label>
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button type="button" className="mt-1 text-xs underline text-muted-foreground" onClick={() => setAmount(String(Math.floor(Number(w?.available ?? 0))))}>Withdraw all</button>
          <Label className="mt-3 block">Bank details</Label>
          <Textarea rows={3} maxLength={300} value={bank} onChange={(e) => setBank(e.target.value)} placeholder={"Bank name\nAccount holder\nIBAN AE00 0000 0000 0000 0000 000"} />
          <Button className="mt-4 w-full bg-gradient-gold text-gold-foreground" disabled={busy} onClick={request}>{busy ? "Sending…" : "Request withdrawal"}</Button>
        </div>
      </div>
    </div>
  );
}
