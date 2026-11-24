import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { artistCheckout } from "@/lib/payments.functions";
import { SandboxCheckout, PaymentTestModeBanner, type CheckoutSession } from "@/components/site/SandboxCheckout";
import { TOPUP_PACKAGES } from "@/lib/masking";
import { downloadCsv, toCsv } from "@/lib/csv";
import { AED_PER_USD, aedOf, axisLabel, dayKey, estimateUsd, inputTokens, isSpend, lastDays, modelColors, niceMax, sums, usdOf, valueOf, type LedgerRow, type Metric } from "@/lib/credits-usage";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { BillingPanel } from "./BillingPanel";
import { useArtistPlan } from "./PromptLibrary";
import { StudioHeading, StudioSection } from "./StudioPage";

const n0 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });
const A2 = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const A4 = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
const aedc = (n: number) => (n < 0.01 ? A4(n) : A2(n));
const fdt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ACTIVITY: Record<string, string> = { plan_allocation: "Plan credits", ai_reply: "AI reply", agent_reply: "Your AI agent", topup_demo: "Top-up (demo)", topup_stripe_sandbox: "Stripe sandbox top-up", test_reply: "Assistant test" };
const th = "whitespace-nowrap border-b border-border bg-[#0d1222] px-2.5 py-3 text-start text-[11px] font-extrabold uppercase tracking-[.1em] text-muted-foreground";
const td = "border-b border-border px-2.5 py-3 align-middle";
const Tab = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold ${on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{children}</button>;

/** AI credits for artists, laid out as in the design reference: balance, usage chart, tokens and cost per model, history, plan and top-up. */
export function CreditsPage({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const top$ = useServerFn(artistCheckout);
  const plan = useArtistPlan(artistId);
  const [checkout, setCheckout] = useState<CheckoutSession | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>("credits");
  const [range, setRange] = useState(14);
  const [hover, setHover] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fm, setFm] = useState("");
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ["wallet", artistId],
    queryFn: async () => {
      const [w, l, r] = await Promise.all([
        supabase.from("credit_wallets").select("balance,balance_fraction").eq("artist_id", artistId).maybeSingle(),
        supabase.from("credit_ledger").select("id, created_at, delta, delta_fraction, final_charge_credits, ref, reason, model, tokens_in, tokens_cached, tokens_out, cost_usd_micros").eq("artist_id", artistId).order("created_at", { ascending: false }).limit(1000),
        Promise.resolve({ data: [] as {model:string;label:string|null;usd_in_per_mtok:number;usd_cached_per_mtok:number;usd_out_per_mtok:number;is_active:boolean}[] }),
      ]);
      return { balance: Number(w.data?.balance ?? 0) + Number(w.data?.balance_fraction ?? 0), ledger: (l.data ?? []).filter(row => row.reason !== "ai_task_reserve").map(row => { const reservation = l.data?.find(item => item.reason === "ai_task_reserve" && item.ref === row.ref); const delta = row.reason === "ai_task_settlement" ? -Number(row.final_charge_credits ?? 0) : row.delta + Number(row.delta_fraction); return { ...row, delta, cost_usd_micros: row.reason === "ai_task_settlement" ? Math.round(Math.max(0,-delta) * 0.49 / 3.6725 * 1000000) : row.cost_usd_micros }; }) as LedgerRow[], rates: r.data ?? [] };
    },
  });
  const ledger = useMemo(() => data?.ledger ?? [], [data?.ledger]);
  const rates = useMemo(() => data?.rates ?? [], [data?.rates]);
  const spends = useMemo(() => ledger.filter(isSpend), [ledger]);
  const labelOf = (m: string | null) => (m ? rates.find((r) => r.model === m)?.label || m : t("No model"));
  const colors = useMemo(() => modelColors([...spends.map((r) => r.model ?? ""), ...rates.map((r) => r.model)]), [spends, rates]);
  const days = useMemo(() => lastDays(range), [range]);
  const inRange = useMemo(() => { const set = new Set(days); return spends.filter((r) => set.has(dayKey(r.created_at))); }, [spends, days]);
  const byDay = useMemo(() => {
    const m = new Map<string, LedgerRow[]>();
    for (const r of inRange) m.set(dayKey(r.created_at), [...(m.get(dayKey(r.created_at)) ?? []), r]);
    return m;
  }, [inRange]);
  const modelIds = useMemo(() => [...new Set(inRange.map((r) => r.model ?? ""))].sort(), [inRange]);
  const columns = days.map((d) => { const L = byDay.get(d) ?? []; return { d, L, total: valueOf(L, metric), seg: modelIds.map((m) => valueOf(L.filter((r) => (r.model ?? "") === m), metric)) }; });
  const max = niceMax(Math.max(0, ...columns.map((c) => c.total)));
  const s = sums(inRange);
  const fmtV = (v: number) => (metric === "credits" ? `${n0(v)} ${t(v === 1 ? "credit" : "credits")}` : metric === "tokens" ? `${n0(v)} ${t("tokens")}` : A2(v));
  const detail = hover ? columns.find((c) => c.d === hover) : null;
  const dn = (d: string) => { const x = new Date(`${d}T00:00:00Z`); return `${DOW[x.getUTCDay()]} ${x.getUTCDate()} ${x.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}`; };

  const monthKey = dayKey(new Date()).slice(0, 7);
  const spentMonth = spends.filter((r) => dayKey(r.created_at).startsWith(monthKey)).length;
  const all = sums(spends);
  const avgAed = spends.length ? all.aed / spends.length : 0;

  const needle = q.trim().toLowerCase();
  const history = ledger.filter((r) => (!fm || r.model === fm) && (!needle || `${fdt(r.created_at)} ${ACTIVITY[r.reason] ?? r.reason} ${labelOf(r.model)}`.toLowerCase().includes(needle)));
  const per = 10;
  const pages = Math.max(1, Math.ceil(history.length / per));
  const cur = Math.min(page, pages);
  const shown = history.slice((cur - 1) * per, cur * per);

  const buy = async (id: string) => {
    setBusy(id);
    try { const r = await top$({ data: { kind: "credits", packageId: id } }); if ("error" in r) throw new Error(r.error); setCheckout(r); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("Top-up failed")); } finally { setBusy(null); }
  };
  const exportCsv = () => downloadCsv(`dealmaker-ai-credits-${dayKey(new Date())}.csv`, toCsv(history, [
    ["Date and time", (r) => r.created_at], ["Activity", (r) => ACTIVITY[r.reason] ?? r.reason], ["Model", (r) => labelOf(r.model)], ["Input tokens", (r) => inputTokens(r)], ["Cached tokens", (r) => r.tokens_cached ?? 0],
    ["Output tokens", (r) => r.tokens_out ?? 0], ["Cost USD", (r) => usdOf(r).toFixed(6)], ["Cost AED", (r) => aedOf(r).toFixed(4)], ["Credits", (r) => r.delta],
  ]));
  const example = rates[0] ? { rate: rates[0], usd: estimateUsd({ input: 1200, cached: 800, output: 300 }, rates[0]) } : null;

  return (
    <div className="dmr-wrap dmr-cpage">
      <StudioHeading title="AI" accent="credits"><span className="inline-flex items-center gap-2 rounded-full border border-gold/40 px-3.5 py-[9px] text-[12.5px] font-bold text-gold"><Sparkles className="h-3.5 w-3.5" />{t("Plan")} <b className="font-extrabold">{plan.data?.mine?.name ?? "-"}</b></span></StudioHeading>
      <p className="dmr-c-12 -mt-2 text-sm text-muted-foreground">{t("Credits cover each AI task based on its token usage. Your history shows the final task charge.")}</p>
      <div className="dmr-c-12"><PaymentTestModeBanner />{checkout && <SandboxCheckout session={checkout} onPaid={() => { setCheckout(null); toast.success(t("Payment verified — credits added")); void qc.invalidateQueries({ queryKey: ["wallet", artistId] }); }} />}</div>

      <section className="dmr-panel dmr-c-12 grid gap-8 !p-[30px] bg-[radial-gradient(ellipse_at_0%_0%,rgba(232,176,74,.18),transparent_55%),linear-gradient(180deg,#10162a,#0a0e1b)] lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.4fr)]" aria-labelledby="cr-bal-l">
        <div>
          <small id="cr-bal-l" className="block text-[11px] font-extrabold uppercase tracking-[.14em] text-muted-foreground">{t("AI credit balance")}</small>
          <div className="mt-2.5 font-display text-[clamp(56px,6vw,88px)] leading-[.98] tracking-[-.035em] tabular-nums" aria-live="polite">{n0(data?.balance ?? 0)}<span className="ms-2 font-sans text-[.26em] font-bold tracking-normal text-gold">{t("credits")}</span></div>
          <p className="mt-3 max-w-[380px] text-sm text-muted-foreground">{t("Clients never pay for AI. Credits only cover the replies your AI agent sends for you.")}</p>
          <div className="mt-3.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground"><span><b className="text-foreground">1 {t("credit")}</b> = AED 0.49</span><span aria-hidden>·</span><span>{t("about")} <b className="text-foreground">{A4(avgAed)}</b> {t("final charge per task")}</span></div>
          <div className="mt-5 flex flex-wrap items-center gap-3"><Button asChild className="rounded-full bg-gradient-gold px-5 font-bold text-gold-foreground"><a href="#cr-packs"><Sparkles className="me-2 h-4 w-4" />{t("Buy credits")}</a></Button><small className="text-xs text-muted-foreground/80">{n0(spentMonth)} {t("spent this month")}</small></div>
          {(data?.balance ?? 0) < 20 && <p className="mt-4 rounded-xl border border-gold/35 bg-gold/[.07] px-3.5 py-2.5 text-[13px]">{t("Your credits are running low. When they run out, new chats wait for your personal reply.")}</p>}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-[26px] leading-none">{t("Usage")} <span className="it">{t("per day")}</span></h2>
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-0.5 rounded-xl bg-foreground/[.04] p-[3px]" role="group" aria-label={t("Chart value")}>{([["credits", "Credits"], ["tokens", "Tokens"], ["cost", "Cost"]] as const).map(([k, l]) => <Tab key={k} on={metric === k} onClick={() => setMetric(k)}>{t(l)}</Tab>)}</div>
              <div className="flex gap-0.5 rounded-xl bg-foreground/[.04] p-[3px]" role="group" aria-label={t("Chart range")}>{[7, 14, 30].map((n) => <Tab key={n} on={range === n} onClick={() => setRange(n)}>{n} {t("days")}</Tab>)}</div>
            </div></div>
          <div className="mt-3 flex min-h-5 flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground" aria-live="polite">
            {detail ? <><b className="text-foreground">{dn(detail.d)}</b><span><b className="text-foreground">{n0(detail.L.length)}</b> {t("replies")}</span><span><b className="text-foreground">{n0(sums(detail.L).tokens)}</b> {t("tokens")}</span><span><b className="text-foreground">{A2(sums(detail.L).aed)}</b></span></>
              : <><b className="text-foreground">{t("Last")} {range} {t("days")}</b><span><b className="text-foreground">{n0(s.replies)}</b> {t("replies")}</span><span><b className="text-foreground">{n0(s.tokens)}</b> {t("tokens")}</span><span><b className="text-foreground">{A2(s.aed)}</b></span><span className="text-muted-foreground/60">{t("Hover or focus a bar for one day")}</span></>}
          </div>
          <div className="mt-3 grid grid-cols-[34px_minmax(0,1fr)] gap-x-2">
            <div className="flex h-48 flex-col-reverse justify-between text-[10.5px] tabular-nums text-muted-foreground/70" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <span key={i}>{axisLabel((max / 4) * i, metric)}</span>)}</div>
            <div className="relative h-48 border-b border-l border-border" role="group" aria-label={t("Daily usage, one bar per day")}>
              <div className="pointer-events-none absolute inset-0 grid grid-rows-4" aria-hidden>{[0, 1, 2, 3].map((i) => <i key={i} className="border-t border-dashed border-border/60" />)}</div>
              {inRange.length === 0 && <span className="absolute inset-0 grid place-items-center text-[13px] text-muted-foreground">{t("No AI replies in this range")}</span>}
              <div className="absolute inset-0 flex items-end gap-[3px] px-1">
                {columns.map((c, i) => (
                  <button key={c.d} type="button" aria-label={`${dn(c.d)}: ${fmtV(c.total)}, ${c.L.length} ${t("replies")}`} onMouseEnter={() => setHover(c.d)} onFocus={() => setHover(c.d)} onClick={() => setHover(c.d)} onMouseLeave={() => setHover(null)} onBlur={() => setHover(null)}
                    className={`group flex h-full min-w-0 flex-1 items-end rounded-t-md outline-none focus-visible:bg-foreground/10 ${hover === c.d ? "bg-foreground/[.06]" : ""}`}>
                    <div className={`flex w-full flex-col-reverse overflow-hidden rounded-t-[5px] transition-[height] duration-700 ${i === columns.length - 1 ? "ring-1 ring-gold/60" : ""}`} style={{ height: `${(c.total / max) * 100}%` }}>
                      {modelIds.map((m, k) => c.total > 0 && c.seg[k]! > 0 ? <i key={m} className="block w-full" style={{ height: `${(c.seg[k]! / c.total) * 100}%`, background: colors[m] }} /> : null)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <span />
            <div className="mt-1 grid text-center text-[10.5px] text-muted-foreground/70" style={{ gridAutoColumns: "minmax(0,1fr)", gridAutoFlow: "column" }} aria-hidden>
              {days.map((d, i) => <span key={d}>{range === 7 ? DOW[new Date(`${d}T00:00:00Z`).getUTCDay()] : range === 30 && (range - 1 - i) % 3 ? "" : Number(d.slice(8))}</span>)}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">{modelIds.map((m) => <span key={m} className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colors[m] }} />{labelOf(m || null)}</span>)}</div>
        </div>
      </section>

      <div className="dmr-c-12 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([["Credits used", n0(s.replies), `${t("Last")} ${range} ${t("days")}, 1 ${t("per reply")}`, true], ["Tokens used", n0(s.tokens), `${n0(s.input)} ${t("in")} · ${n0(s.cached)} ${t("cached")} · ${n0(s.output)} ${t("out")}`, false], ["Estimated cost", A2(s.aed), `USD ${s.usd.toFixed(2)} ${t("at list rates")}`, false], ["Average reply", `${n0(s.replies ? s.tokens / s.replies : 0)} ${t("tokens")}`, s.replies ? `${A4(s.aed / s.replies)} ${t("per reply")}` : t("No replies yet"), false]] as const).map(([l, v, e, gold]) => (
          <div key={l} className="dmr-qs !min-w-0 !px-[18px] !py-4"><small>{t(l)}</small><b className={`block !text-[28px] tabular-nums ${gold ? "text-gold" : ""}`}>{v}</b><em className="mt-1 block text-[11px] not-italic text-muted-foreground">{e}</em></div>
        ))}
      </div>

      <div className="dmr-w-left">
        <section className="dmr-panel dmr-q-panel !p-0" aria-label={t("Usage by model")}>
          <div className="border-b border-border px-5 py-4"><h2 className="font-display text-[28px] leading-none">{t("Usage by")} <span className="it">{t("model")}</span></h2><small className="text-xs text-muted-foreground">{t("Last")} {range} {t("days, which model answered and what it used")}</small></div>
          {inRange.length > 0 ? (
            <div className="min-w-0 overflow-x-auto"><table className="w-full min-w-[640px] border-separate border-spacing-0 text-[13.5px]">
              <thead><tr><th className={th}>{t("Model")}</th>{["Replies", "Input tokens", "Output tokens", "Cost", "Share"].map((h) => <th key={h} className={`${th} text-end`}>{t(h)}</th>)}</tr></thead>
              <tbody>{modelIds.map((m) => { const x = inRange.filter((r) => (r.model ?? "") === m), a = sums(x), share = Math.round((x.length / inRange.length) * 100);
                return <tr key={m}>
                  <td className={td}><span className="inline-flex items-center gap-2.5"><i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colors[m] }} /><b className="font-bold">{labelOf(m || null)}</b></span></td>
                  <td className={`${td} text-end tabular-nums`}><b>{n0(a.replies)}</b></td>
                  <td className={`${td} text-end tabular-nums`}>{n0(a.input + a.cached)}<small className="block text-[11px] text-muted-foreground">{n0(a.cached)} {t("cached")}</small></td>
                  <td className={`${td} text-end tabular-nums`}>{n0(a.output)}</td>
                  <td className={`${td} text-end tabular-nums`}><b>{A2(a.aed)}</b><small className="block text-[11px] text-muted-foreground">USD {a.usd.toFixed(2)}</small></td>
                  <td className={`${td} text-end tabular-nums`}><span className="inline-flex items-center gap-2"><s className="block h-1.5 w-14 overflow-hidden rounded-full bg-foreground/10 no-underline"><i className="block h-full" style={{ width: `${share}%`, background: colors[m] }} /></s>{share}%</span></td>
                </tr>; })}</tbody>
            </table></div>
          ) : <p className="px-5 py-8 text-center text-sm text-muted-foreground">{t("No AI replies in this range")}</p>}
        </section>

        <section className="dmr-panel dmr-q-panel !p-0" aria-label={t("Usage history")}>
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
            <div className="me-auto"><h2 className="font-display text-[28px] leading-none">{t("Usage")} <span className="it">{t("history")}</span></h2><small className="text-xs text-muted-foreground">{t("Every credit spent, newest first")}</small></div>
            <label className="relative flex h-10 min-w-44 flex-1 basis-52 items-center"><Search className="pointer-events-none absolute start-3.5 h-4 w-4 text-gold" aria-hidden /><span className="sr-only">{t("Search history")}</span>
              <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("Search date or activity")} autoComplete="off" className="h-full w-full rounded-[14px] border border-border bg-foreground/[.03] pe-3 ps-10 text-sm outline-none focus-visible:border-gold" /></label>
            <label><span className="sr-only">{t("Filter by model")}</span>
              <select value={fm} onChange={(e) => { setFm(e.target.value); setPage(1); }} className="h-10 rounded-xl border border-border bg-foreground/[.05] px-3 pe-7 text-[13px] font-bold"><option value="">{t("All models")}</option>{[...new Set(ledger.map((r) => r.model).filter(Boolean) as string[])].sort().map((m) => <option key={m} value={m}>{labelOf(m)}</option>)}</select></label>
            <Button type="button" variant="outline" className="h-10 rounded-full px-4 text-[13px]" disabled={history.length === 0} onClick={exportCsv}>{t("Export CSV")}</Button>
          </div>
          {shown.length > 0 ? (
            <div className="min-w-0 overflow-x-auto"><table className="w-full min-w-[720px] border-separate border-spacing-0 text-[13.5px]">
              <thead><tr><th className={th}>{t("Date and time")}</th><th className={th}>{t("Activity")}</th><th className={th}>{t("Model")}</th>{["Input", "Output", "Cost", "Credits"].map((h) => <th key={h} className={`${th} text-end`}>{t(h)}</th>)}</tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} whitespace-nowrap`}>{fdt(r.created_at)}</td><td className={td}><b className="font-bold">{t(ACTIVITY[r.reason] ?? r.reason)}</b></td>
                  <td className={td}>{r.model ? <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colors[r.model] }} />{labelOf(r.model)}</span> : <span className="text-muted-foreground/60">-</span>}</td>
                  <td className={`${td} text-end tabular-nums`}>{r.model ? <>{n0(inputTokens(r))}<small className="block text-[11px] text-muted-foreground">{n0(r.tokens_cached ?? 0)} {t("cached")}</small></> : "-"}</td>
                  <td className={`${td} text-end tabular-nums`}>{r.model ? n0(r.tokens_out ?? 0) : "-"}</td>
                  <td className={`${td} text-end tabular-nums`}>{r.model && r.cost_usd_micros != null ? <>{aedc(aedOf(r))}<small className="block text-[11px] text-muted-foreground">USD {usdOf(r).toFixed(5)}</small></> : "-"}</td>
                  <td className={`${td} text-end font-extrabold tabular-nums ${r.delta < 0 ? "text-[#e58a8a]" : "text-emerald-300"}`}>{r.delta > 0 ? "+" : ""}{r.delta}</td>
                </tr>))}</tbody>
            </table></div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center"><span className="grid h-[60px] w-[60px] place-items-center rounded-full border border-gold/25 bg-[radial-gradient(circle,rgba(232,176,74,.22),rgba(232,176,74,.04)_70%)] text-gold"><Sparkles className="h-[22px] w-[22px]" /></span><b className="font-display text-2xl font-normal">{t("No usage found")}</b><p className="text-[13px] text-muted-foreground">{t("Try another model or clear the search.")}</p></div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
            <span>{history.length ? `${(cur - 1) * per + 1} ${t("to")} ${(cur - 1) * per + shown.length} ${t("of")} ${history.length}` : t("0 results")}</span>
            <div className="flex items-center gap-2"><Button size="sm" variant="outline" className="rounded-full" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>{t("Previous")}</Button><span>{t("Page")} {cur} {t("of")} {pages}</span><Button size="sm" variant="outline" className="rounded-full" disabled={cur >= pages} onClick={() => setPage(cur + 1)}>{t("Next")}</Button></div>
          </div>
        </section>

        <StudioSection title="Your" accent="plan" subtitle="Registration deposit required before a paid subscription"><BillingPanel artistId={artistId} /><p className="mt-3 text-xs text-muted-foreground">{t("Billing history: no subscription invoices yet.")}</p></StudioSection>

        <StudioSection id="cr-packs" title="Top up" accent="credits" subtitle="One-off packs, never expire in this preview">
          <div className="grid gap-3 sm:grid-cols-3">
            {TOPUP_PACKAGES.map((p) => { const inc = p.priceAed * 1.05; return (
              <div key={p.id} className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-foreground/[.02] p-4 text-center">
                <b className="font-display text-4xl font-normal">{n0(p.credits)}</b><small className="text-xs text-muted-foreground">{t("credits")}</small>
                <span className="mt-2 text-sm font-semibold">AED {inc.toFixed(2)} {t("incl. VAT 5%")}</span><span className="text-xs text-muted-foreground">AED {(p.priceAed / p.credits).toFixed(3)} {t("per credit before VAT")}</span>
                <Button className="mt-3 w-full rounded-full bg-gradient-gold font-bold text-gold-foreground" disabled={busy !== null} onClick={() => void buy(p.id)}>{busy === p.id ? t("Processing…") : t("Buy · Stripe sandbox")}</Button>
              </div>); })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t("Prices include 5% VAT. The per-credit price is shown before VAT.")}</p>
        </StudioSection>
      </div>

      <div className="dmr-w-side">
        <section className="dmr-panel" aria-labelledby="cr-hw-h">
          <h2 id="cr-hw-h" className="font-display text-[22px] leading-tight">{t("How credits")} <span className="it">{t("work")}</span></h2>
          <ul className="mt-3 grid gap-3 text-[13px] text-muted-foreground">
            {([["Per-task credits.", "The final charge follows the tokens used by the agent task."], ["Reserved credits.", "Credits are reserved before a task starts; unused credits return after verified completion."], ["Out of credits?", "AI tasks pause until sufficient credits are available."]] as const).map(([h, p]) => <li key={h}><b className="text-foreground">{t(h)}</b> {t(p)}</li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}
