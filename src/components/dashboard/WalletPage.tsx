import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, Send, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { holdHoursLeft, maskIban, useBankDetails } from "./useBankDetails";
import { StudioHeading } from "./StudioPage";
import { walletShare, type WalletState } from "@/lib/wallet-rules";

type JobState = WalletState;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const aed2 = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const aed0 = (n: number) => `AED ${Math.round(n).toLocaleString("en-US")}`;
const fdt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-");
const LABEL: Record<JobState, string> = { awaiting: "Awaiting payment", escrow: "In escrow", review: "In review", ready: "Released" };
const CHIP: Record<string, string> = {
  awaiting: "text-muted-foreground border-border", escrow: "text-foreground border-foreground/35", review: "text-gold border-gold/40 bg-gold/[.08]", pending: "text-gold border-gold/40 bg-gold/[.08]",
  ready: "text-emerald-300 border-emerald-300/35 bg-emerald-300/[.08]", paid: "text-emerald-300 border-emerald-300/35 bg-emerald-300/[.08]", rejected: "text-[#ff8a7a] border-red-400/35 bg-red-500/[.08]", cancelled: "text-muted-foreground/60 line-through border-border",
};
const SEG_DOT: Record<string, string> = { available: "#7bd88f", escrow: "rgba(246,239,226,.55)", pending: "#d4842a", paid: "rgba(246,239,226,.2)" };
const th = "whitespace-nowrap border-b border-border bg-[#0d1222] px-2.5 py-3 text-start text-[11px] font-extrabold uppercase tracking-[.1em] text-muted-foreground";
const td = "border-b border-border px-2.5 py-3 align-middle";
const Chip = ({ kind, children }: { kind: string; children: React.ReactNode }) => <span className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-[11px] text-[10.5px] font-extrabold tracking-[.03em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-current before:content-[''] ${CHIP[kind] ?? ""}`}>{children}</span>;

/** Wallet for artists, laid out as in the design reference: balance, where the money is, job earnings, withdrawals and the request form. */
export function WalletPage({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["wallet-pay", artistId];
  const { data, error: loadError } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [w, r, b] = await Promise.all([
        supabase.rpc("artist_wallet", { _artist: artistId }),
        supabase.from("payout_requests").select("id, amount, status, created_at, decided_at, admin_note, bank_snapshot").eq("artist_id", artistId).order("created_at", { ascending: false }),
        supabase.from("bookings").select("id, client_name, package_title, event_date, amount, vat_amount, total, paid_amount, refund_amount, status, escrow_status, commission_rate").eq("artist_id", artistId).is("deleted_at", null).eq("is_seed", false).neq("status", "cancelled").order("event_date", { ascending: false }).limit(500),
      ]);
      if (w.error) throw w.error;
      return { w: w.data?.[0], requests: r.data ?? [], bookings: b.data ?? [] };
    },
  });
  const bank = useBankDetails(artistId).data ?? null;
  const holdLeft = holdHoursLeft(bank?.updated_at);
  const [filter, setFilter] = useState<"all" | JobState>("all");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const w = data?.w;
  const pct = Number(w?.commission_pct ?? 0);
  const available = Number(w?.available ?? 0);

  const jobs = useMemo(() => (data?.bookings ?? []).map((b) => {
    const rate = b.commission_rate != null ? Number(b.commission_rate) : pct;
    return { id: b.id, client: b.client_name, title: b.package_title ?? t("Booking"), date: b.event_date, rate, ...walletShare(b, rate) };
  }).sort((a, b) => ({ review: 0, escrow: 1, ready: 2, awaiting: 3 })[a.state] - ({ review: 0, escrow: 1, ready: 2, awaiting: 3 })[b.state] || b.date.localeCompare(a.date)), [data?.bookings, pct, t]);
  const sumBy = (state: JobState) => r2(jobs.filter((j) => j.state === state).reduce((n, j) => n + j.net, 0));
  const escrow = r2(sumBy("escrow") + sumBy("review"));
  const awaiting = sumBy("awaiting");
  const pending = Number(w?.pending ?? 0), paidOut = Number(w?.paid_out ?? 0);
  const seg: [string, string, string, number][] = [
    ["available", "Available to withdraw", "Released and ready", available], ["escrow", "In escrow", "Client paid, job not done or still in review", escrow],
    ["pending", "Payout in progress", "Pending withdrawal requests", pending], ["paid", "Paid out", "Already in your bank", paidOut],
  ];
  const total = seg.reduce((n, s) => n + s[3], 0);
  const counted = jobs.filter((j) => j.state !== "awaiting");
  const gross = Number(w?.gross ?? 0), fee = Number(w?.fee ?? 0), doneJobs = Number(w?.jobs ?? 0);
  const counts = { all: jobs.length, awaiting: 0, escrow: 0, review: 0, ready: 0 };
  for (const j of jobs) counts[j.state]++;
  const view = jobs.filter((j) => filter === "all" || j.state === filter);
  const tot = filter === "awaiting" ? view : view.filter((j) => j.state !== "awaiting");

  const n = Number(amount);
  const hint = !amount ? `${t("You can withdraw up to")} ${aed2(available)}.` : !(n > 0) ? t("Enter an amount") : n > available ? t("Amount is more than your available balance") : `${t("You will request")} ${aed2(n)}.`;
  const hintBad = !!amount && (!(n > 0) || n > available);
  const blocked = !bank ? t("Add your bank details in Account settings first.") : holdLeft > 0 ? `${t("Bank details changed recently. Withdrawals reopen in")} ${holdLeft} ${t("hours")}.` : "";
  const request = async () => {
    if (!(n > 0)) { toast.error(t("Enter an amount")); return; }
    if (n > available) { toast.error(t("Amount is more than your available balance")); return; }
    if (blocked) { toast.error(blocked); return; }
    setBusy(true);
    // The database copies the saved bank record into the request; the app never sends bank text.
    const { error } = await supabase.from("payout_requests").insert({ artist_id: artistId, amount: n });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setAmount(""); toast.success(t("Withdrawal requested. Our team will process it."));
    void qc.invalidateQueries({ queryKey: key });
  };
  const [whole, cents] = r2(available).toFixed(2).split(".");
  const locked = (labelText: string, value: string | null | undefined, grow = false) => (
    <div className={`space-y-2 ${grow ? "" : ""}`}><label className="text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{t(labelText)}</label>
      <div className="relative"><Input disabled value={value ?? ""} title={t("Set in Account settings")} className="rounded-xl border-dashed !bg-foreground/[.025] pe-9 disabled:opacity-100" /><Lock className="pointer-events-none absolute end-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground/60" aria-hidden /></div></div>
  );

  return (
    <div className="dmr-wrap dmr-wpage">
      <StudioHeading title="Wal" accent="let"><span className="inline-flex items-center gap-2 rounded-full border border-gold/40 px-3.5 py-[9px] text-[12.5px] font-bold text-gold">{t("Platform fee")} <b className="font-extrabold">{pct}%</b></span></StudioHeading>
      {loadError && <p role="alert" className="dmr-c-12 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">{t("Your wallet could not be loaded, so the amounts below are not shown correctly. Refresh the page, and contact support if this stays.")}</p>}
      <p className="dmr-c-12 -mt-2 text-sm text-muted-foreground">{t("What you earned from jobs booked through Dealmaker. Clients pay into escrow, your plan fee is already taken off, and you withdraw what has been released.")}</p>

      <section className="dmr-panel dmr-c-12 grid gap-10 !p-[30px] bg-[radial-gradient(ellipse_at_0%_0%,rgba(232,176,74,.18),transparent_55%),linear-gradient(180deg,#10162a,#0a0e1b)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" aria-labelledby="w-av-l">
        <div>
          <small id="w-av-l" className="block text-[11px] font-extrabold uppercase tracking-[.14em] text-muted-foreground">{t("Available to withdraw")}</small>
          <div className="mt-2.5 font-display text-[clamp(56px,6.4vw,96px)] leading-[.98] tracking-[-.035em] tabular-nums" dir="ltr" aria-live="polite"><span className="me-[.3em] font-sans text-[.34em] font-bold tracking-normal text-gold">AED</span>{Number(whole).toLocaleString("en-US")}<sup className="align-baseline text-[.4em] tracking-normal text-muted-foreground">.{cents}</sup></div>
          <p className="mt-3 max-w-[380px] text-sm text-muted-foreground">{doneJobs ? `${t("From")} ${doneJobs} ${t(doneJobs > 1 ? "completed jobs" : "completed job")}. ${t("Your")} ${pct}% ${t("platform fee is already taken off.")}` : t("Released money from completed jobs shows here.")}</p>
          <div className="mt-[22px] flex flex-wrap items-center gap-3"><Button asChild className="rounded-full bg-gradient-gold px-5 font-bold text-gold-foreground"><a href="#wd"><Wallet className="me-2 h-4 w-4" />{t("Request withdrawal")}</a></Button></div>
        </div>
        <div className="flex min-w-0 flex-col justify-center">
          <div className="flex h-3.5 gap-[3px] overflow-hidden rounded-full bg-foreground/[.05]" role="img" aria-label={total ? `${t("Where your money is")}: ${seg.filter((s) => s[3]).map((s) => `${t(s[1])} ${aed2(s[3])}`).join(", ")}` : t("No money yet")}>
            {seg.map(([k, l, , v]) => v ? <i key={k} title={t(l)} className="block h-full min-w-1.5 basis-0 rounded-full" style={{ flexGrow: v, background: SEG_DOT[k] }} /> : null)}
          </div>
          <ul className="mt-3.5">
            {seg.map(([k, l, s, v]) => (
              <li key={k} className={`grid grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-3 border-b border-dashed border-border py-2.5 text-[13.5px] last:border-0 ${v ? "" : "opacity-45"}`}>
                <i className="h-2.5 w-2.5 rounded-full" style={{ background: SEG_DOT[k] }} /><div><b className="block font-semibold">{t(l)}</b><small className="block text-xs text-muted-foreground">{t(s)}</small></div><em className="font-extrabold not-italic tabular-nums" dir="ltr">{aed2(v)}</em>
              </li>
            ))}
          </ul>
          {awaiting > 0 && <p className="mt-1.5 text-xs text-muted-foreground">{aed2(awaiting)} {t("more is waiting for clients to pay. It is not counted above.")}</p>}
        </div>
      </section>

      <div className="dmr-c-12 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {([["Completed work", aed0(gross), `${doneJobs} ${t(doneJobs === 1 ? "job" : "jobs")}, ${t("excl. VAT")}`, false], [`${t("Platform fee")} (${pct}%)`, `- ${aed0(fee)}`, t("Based on your plan"), false], [t("You earned"), aed0(Number(w?.net ?? gross - fee)), t("After platform fee"), true], [t("Withdrawn / pending"), aed0(paidOut), `${aed0(pending)} ${t("pending")}`, false]] as const).map(([l, v, h, gold]) => (
          <div key={l} className="dmr-qs !min-w-0 !px-[18px] !py-4"><small>{t(l)}</small><b dir="ltr" className={`block !text-[30px] tabular-nums ${gold ? "text-gold" : ""}`}>{v}</b><em className="mt-1 block text-[11px] not-italic text-muted-foreground">{h}</em></div>
        ))}
      </div>

      <div className="dmr-w-left">
        <div className="space-y-6">
          <section className="dmr-panel dmr-q-panel !p-0" aria-label={t("Job earnings")}>
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
              <div className="me-auto"><h2 className="font-display text-[28px] leading-none">{t("Job")} <span className="it">{t("earnings")}</span></h2><small className="text-xs text-muted-foreground">{t("Fee and net per job, excl. VAT")}</small></div>
              <div className="flex flex-wrap gap-0.5 rounded-xl bg-foreground/[.04] p-[3px]" role="group" aria-label={t("Filter by money status")}>
                {([["all", "All"], ["awaiting", "Awaiting"], ["escrow", "In escrow"], ["review", "In review"], ["ready", "Released"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`rounded-[10px] px-3 py-1.5 text-[12.5px] font-semibold ${filter === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{t(l)} <span className="opacity-60">{counts[k]}</span></button>)}
              </div>
            </div>
            {view.length > 0 && (
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[13.5px]">
                  <thead><tr><th scope="col" className={th}>{t("Job")}</th><th scope="col" className={th}>{t("Status")}</th><th scope="col" className={`${th} text-end`}>{t("Job fee")}</th><th scope="col" className={`${th} text-end`}>{t("Fee")} ({pct}%)</th><th scope="col" className={`${th} text-end`}>{t("You earn")}</th></tr></thead>
                  <tbody>
                    {view.map((j) => (
                      <tr key={j.id}>
                        <td className={td}><b className="block whitespace-normal font-bold">{j.client} <em className="font-medium not-italic text-muted-foreground">· {j.title}</em></b><small className="mt-0.5 block text-xs text-muted-foreground">{fdt(j.date)}</small></td>
                        <td className={td}><Chip kind={j.state}>{t(LABEL[j.state])}</Chip></td>
                        <td className={`${td} text-end tabular-nums`} dir="ltr">{aed2(j.gross)}</td>
                        <td className={`${td} text-end tabular-nums text-muted-foreground`} dir="ltr">- {aed2(j.fee)}</td>
                        <td className={`${td} text-end tabular-nums ${j.state === "awaiting" ? "text-muted-foreground" : "font-extrabold"}`} dir="ltr"><b>{aed2(j.net)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {view.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-5 py-12 text-center"><span className="grid h-[60px] w-[60px] place-items-center rounded-full border border-gold/25 bg-[radial-gradient(circle,rgba(232,176,74,.22),rgba(232,176,74,.04)_70%)] text-gold"><Wallet className="h-[22px] w-[22px]" /></span><b className="font-display text-2xl font-normal">{t("No jobs here yet")}</b><p className="text-[13px] text-muted-foreground">{t("Jobs appear as soon as a client pays into escrow.")}</p></div>
            )}
            {tot.length > 0 && (
              <div className="flex flex-wrap justify-between gap-x-6 gap-y-3 border-t border-border px-5 py-3.5 text-[12.5px] text-muted-foreground">
                <span>{tot.length} {t(tot.length > 1 ? "jobs" : "job")}{filter === "awaiting" ? ` (${t("projected")})` : filter === "all" ? ` ${t("counted, awaiting excluded")}` : ""}</span>
                <span>{t("Job fee")} <b className="text-foreground tabular-nums">{aed2(r2(tot.reduce((x, j) => x + j.gross, 0)))}</b></span>
                <span>{t("Platform fee")} <b className="text-foreground tabular-nums">- {aed2(r2(tot.reduce((x, j) => x + j.fee, 0)))}</b></span>
                <span>{filter === "awaiting" ? t("You will earn") : t("You earn")} <b className="text-foreground tabular-nums">{aed2(r2(tot.reduce((x, j) => x + j.net, 0)))}</b></span>
              </div>
            )}
            {counted.length === 0 && jobs.length > 0 && filter === "all" && <p className="px-5 pb-4 text-xs text-muted-foreground">{t("No job has been paid yet, so nothing is counted.")}</p>}
          </section>

          <section className="dmr-panel dmr-q-panel !p-0" aria-label={t("Withdrawal requests")}>
            <div className="border-b border-border px-5 py-4"><h2 className="font-display text-[28px] leading-none">{t("Withdrawal")} <span className="it">{t("requests")}</span></h2><small className="text-xs text-muted-foreground">{t("Newest first")}</small></div>
            {(data?.requests.length ?? 0) > 0 ? (
              <div className="min-w-0 overflow-x-auto">
                <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[13.5px]">
                  <thead><tr><th scope="col" className={th}>{t("Requested")}</th><th scope="col" className={`${th} text-end`}>{t("Amount")}</th><th scope="col" className={th}>{t("Paid to")}</th><th scope="col" className={th}>{t("Status")}</th></tr></thead>
                  <tbody>
                    {data?.requests.map((r) => {
                      const snap = (r.bank_snapshot && typeof r.bank_snapshot === "object" && !Array.isArray(r.bank_snapshot) ? r.bank_snapshot : {}) as Record<string, unknown>;
                      const bankName = typeof snap["bank_name"] === "string" ? snap["bank_name"] : "";
                      const iban = typeof snap["iban"] === "string" ? snap["iban"] : "";
                      return (
                        <tr key={r.id}>
                          <td className={td}><b className="block font-bold">{fdt(r.created_at)}</b><small className="mt-0.5 block text-xs text-muted-foreground">{t("Ref")} {r.id.slice(0, 8).toUpperCase()}</small></td>
                          <td className={`${td} text-end tabular-nums`} dir="ltr"><b>{aed2(Number(r.amount))}</b></td>
                          <td className={td}>{bankName || "-"} {iban && <span className="text-muted-foreground">···{iban.slice(-4)}</span>}</td>
                          <td className={td}><Chip kind={r.status}>{t(r.status === "pending" ? "Pending review" : r.status === "paid" ? "Paid" : r.status === "rejected" ? "Rejected" : r.status)}</Chip>{r.decided_at && r.status === "paid" && <div className="mt-1 text-xs text-muted-foreground">{fdt(r.decided_at)}</div>}{r.admin_note && <small className="mt-1 block text-xs text-muted-foreground">{r.admin_note}</small>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-5 py-12 text-center"><span className="grid h-[60px] w-[60px] place-items-center rounded-full border border-gold/25 bg-[radial-gradient(circle,rgba(232,176,74,.22),rgba(232,176,74,.04)_70%)] text-gold"><Send className="h-[22px] w-[22px]" /></span><b className="font-display text-2xl font-normal">{t("No withdrawals yet")}</b><p className="text-[13px] text-muted-foreground">{t("Your requests and their payout status show up here.")}</p></div>
            )}
          </section>
        </div>
      </div>

      <div className="dmr-w-side">
        <form id="wd" className="dmr-panel flex flex-col gap-3.5 !p-6" noValidate aria-labelledby="wd-h" onSubmit={(e) => { e.preventDefault(); void request(); }}>
          <h2 id="wd-h" className="font-display text-[30px] leading-none">{t("Request")} <span className="it">{t("withdrawal")}</span></h2>
          <p className="-mt-1.5 text-[13px] text-muted-foreground">{t("Paid in AED to your registered UAE bank account. Demo mode: no real money is transferred.")}</p>
          {blocked && <div role="status" className="flex items-start gap-3 rounded-[14px] border border-gold/35 bg-gold/[.07] px-3.5 py-3 text-[13px]"><Lock className="mt-px h-[18px] w-[18px] shrink-0 text-gold" /><div>{blocked}{!bank && <> <a className="font-bold text-gold underline underline-offset-4" href="/account">{t("Add it in Account settings")}</a></>}</div></div>}
          <div className="space-y-2"><label htmlFor="wd-amt" className="text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{t("Amount (AED)")}</label>
            <div className="relative"><span aria-hidden className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold tracking-[.08em] text-gold">AED</span><Input id="wd-amt" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} aria-describedby="wd-hint" onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))} className="rounded-xl !ps-[52px] !text-xl font-bold tabular-nums" dir="ltr" /></div></div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Quick amounts")}>
            {([[25, "25%"], [50, "50%"], [100, "Withdraw all"]] as const).map(([p, l]) => <button key={p} type="button" onClick={() => setAmount(String(Math.floor((available * p) / 100 * 100) / 100))} className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:border-gold hover:text-gold">{l === "Withdraw all" ? t(l) : l}</button>)}
          </div>
          <p id="wd-hint" role="status" className={`min-h-[19px] text-[12.5px] ${hintBad ? "text-[#ff8a7a]" : "text-muted-foreground"}`}>{hint}</p>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-foreground/[.02] p-4" role="group" aria-labelledby="wb-h">
            <div className="flex flex-wrap items-center justify-between gap-2.5"><b id="wb-h" className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.12em] text-muted-foreground"><Lock className="h-3.5 w-3.5 text-gold" />{t("Bank details")}</b><a href="/account" className="text-[12.5px] font-bold text-gold underline decoration-gold/40 underline-offset-[3px] hover:decoration-gold">{t("Manage in Account settings")}</a></div>
            {locked("Bank name", bank?.bank_name)}
            {locked("Account holder name", bank?.holder_name)}
            {locked("IBAN", maskIban(bank?.iban))}
            <div className="grid grid-cols-2 gap-2.5">{locked("SWIFT / BIC", bank?.swift)}{locked("Account type", bank ? t(bank.account_type === "business" ? "Business" : "Personal") : "")}</div>
            <div className="grid grid-cols-2 gap-2.5">{locked("Country", "United Arab Emirates")}{locked("Currency", "AED")}</div>
          </div>
          <Button type="submit" disabled={busy || !!blocked || !(n > 0) || n > available} className="w-full rounded-full bg-gradient-gold font-bold text-gold-foreground"><Send className="me-2 h-4 w-4" />{busy ? t("Sending…") : t("Request withdrawal")}</Button>
          <p className="text-center text-xs text-muted-foreground/70">{t("Payout takes about 3 working days.")}</p>
        </form>

        <section className="dmr-panel !px-6 !py-[22px]" aria-labelledby="wh-h">
          <h2 id="wh-h" className="mb-3.5 font-display text-2xl leading-[1.05]">{t("How your money")} <span className="it">{t("moves")}</span></h2>
          <ol className="grid">
            {([["Client pays into escrow", "Dealmaker holds the payment, so you know the money is real before you perform."], ["You perform, then mark the job Done", "Use the Calendar page to set progress to Done."], ["48 hour review", "After the event ends the client can raise an issue. Then the money is released."], ["You withdraw", "Plan fee is already deducted. Payout takes about 3 working days."]] as const).map(([h, p], i, a) => (
              <li key={h} className="relative pb-4 ps-[38px] text-[13px] text-muted-foreground last:pb-0">
                <span className="absolute start-0 top-0 grid h-[26px] w-[26px] place-items-center rounded-full bg-gradient-gold text-xs font-extrabold text-gold-foreground">{i + 1}</span>
                {i < a.length - 1 && <span className="absolute bottom-1 start-[12.5px] top-[30px] w-px bg-border" aria-hidden />}
                <b className="block text-[13.5px] font-bold text-foreground">{t(h)}</b>{t(p)}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
