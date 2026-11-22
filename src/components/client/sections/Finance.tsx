import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowUpRight, Banknote, CheckCircle2, Clock, Download, Landmark, Plus, Printer, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toCsv, downloadCsv } from "@/lib/csv";
import { useI18n } from "@/lib/i18n";
import { COMMISSION_LABEL, COMMISSION_TONE, monthlyCommission, statementPeriods, statementSummary, type CommissionStatus } from "@/lib/client-portal-rules";
import { usePortal } from "../portal-context";
import { useCommissions, usePayoutAccount, usePayouts, useProfile, useRefresh, useWallet } from "../useClientPortal";
import { CardHead, Empty, LoadError, PageHead, Skeleton, Status, money, moneyShort, shortDate } from "../ui";

const PAYOUT_TONE = { submitted: "gold", approved: "gold", paid: "green", rejected: "red" } as const;
const PAYOUT_LABEL = { submitted: "Submitted", approved: "Approved", paid: "Paid", rejected: "Rejected" } as const;
const accountLine = (snap: unknown) => {
  const s = (snap ?? {}) as Record<string, unknown>;
  return s["bank_name"] ? `${String(s["bank_name"])} · •••• ${String(s["iban_last4"] ?? "")}` : "—";
};

export function CommissionOverview() {
  const { uid, go } = usePortal();
  const { t } = useI18n();
  const wallet = useWallet(uid);
  const rows = useCommissions(uid);
  const [range, setRange] = useState<"6" | "12">("6");
  const chart = useMemo(() => monthlyCommission(rows.data ?? [], Number(range)), [rows.data, range]);
  const max = Math.max(1, ...chart.map((c) => c.value));
  const w = wallet.data;
  return (
    <section className="cp-page">
      <PageHead eyebrow="Earnings" title="COMMISSION OVERVIEW" text="Track commission earned from your paid artist bookings." actions={<button type="button" className="cp-btn cp-btn-gold" onClick={() => go("withdrawals")}>{t("Withdraw funds")} <ArrowUpRight aria-hidden="true" /></button>} />
      {wallet.error ? <LoadError error={wallet.error} /> : null}
      <div className="cp-grid">
        <div className="cp-wallet-hero cp-span-6"><small>{t("LIFETIME COMMISSION")}</small><div className="cp-amount">{w ? money(w.lifetime) : "…"}</div><small>{t("Total commission credited after payment was released to the artist")}</small></div>
        <div className="cp-card cp-span-6">
          <div className="cp-wallet-grid" style={{ margin: 0 }}>
            <div className="cp-wallet-stat"><small>{t("Available")}</small><b>{w ? moneyShort(w.available) : "…"}</b></div>
            <div className="cp-wallet-stat"><small>{t("Pending")}</small><b>{w ? moneyShort(w.pending + w.onHold) : "…"}</b></div>
            <div className="cp-wallet-stat"><small>{t("Withdrawn")}</small><b>{w ? moneyShort(w.withdrawn) : "…"}</b></div>
          </div>
          <div style={{ marginTop: 18 }}>
            <div className="cp-row cp-between cp-small"><span className="cp-muted">{t("Commission rate")}</span><b>{w ? `${w.rate}% ${t(w.enabled ? "of booking value before VAT" : "(programme paused)")}` : "…"}</b></div>
            <div className="cp-row cp-between cp-small" style={{ marginTop: 8 }}><span className="cp-muted">{t("Minimum withdrawal")}</span><b>{w ? moneyShort(w.minimum) : "…"}</b></div>
            <div className="cp-row cp-between cp-small" style={{ marginTop: 8 }}><span className="cp-muted">{t("Rate on each booking")}</span><b>{t("Fixed at first payment")}</b></div>
          </div>
        </div>
        <div className="cp-card cp-span-12">
          <CardHead title="Commission performance" text="Commission recorded per month, excluding reversed bookings" aside={<select className="cp-input" value={range} onChange={(e) => setRange(e.target.value as "6" | "12")} aria-label={t("Period")}><option value="6">{t("Last 6 months")}</option><option value="12">{t("Last 12 months")}</option></select>} />
          {rows.isLoading ? <div className="cp-skeleton" style={{ height: 210 }} /> : (
            <div className="cp-chart" role="img" aria-label={chart.map((c) => `${c.label} ${money(c.value)}`).join(", ")}>
              {chart.map((c) => <div key={c.key} className="cp-bar"><b>{c.value ? moneyShort(c.value).replace("AED ", "") : ""}</b><i className={c.value ? "" : "is-zero"} style={{ height: `${Math.max(3, (c.value / max) * 82)}%` }} /><small>{c.label}</small></div>)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function CommissionHistory() {
  const { uid } = usePortal();
  const { t } = useI18n();
  const rows = useCommissions(uid);
  const [q, setQ] = useState("");
  const [f, setF] = useState<"" | CommissionStatus>("");
  const shown = (rows.data ?? []).filter((r) => (!f || r.status === f) && `${r.reference} ${r.artist_name} ${r.service}`.toLowerCase().includes(q.trim().toLowerCase()));
  const exportCsv = () => {
    downloadCsv(`dealmaker-commission-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(shown, [["Booking", (r) => r.reference], ["Artist", (r) => r.artist_name], ["Service", (r) => r.service], ["Eligible value (AED)", (r) => Number(r.eligible_value).toFixed(2)], ["Rate %", (r) => r.rate], ["Commission (AED)", (r) => Number(r.commission).toFixed(2)], ["Date", (r) => r.credited_at.slice(0, 10)], ["Status", (r) => COMMISSION_LABEL[r.status as CommissionStatus] ?? r.status]]));
    toast.success(t("CSV export generated."));
  };
  return (
    <section className="cp-page">
      <PageHead eyebrow="Earnings" title="COMMISSION HISTORY" text="Every commission credit, hold and reversal linked to its booking." actions={<button type="button" className="cp-btn cp-btn-line" disabled={!shown.length} onClick={exportCsv}><Download aria-hidden="true" />{t("Export")}</button>} />
      <div className="cp-card">
        <div className="cp-toolbar">
          <input className="cp-input cp-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search booking or artist…")} aria-label={t("Search commission")} />
          <select className="cp-input" value={f} onChange={(e) => setF(e.target.value as CommissionStatus | "")} aria-label={t("Status")}><option value="">{t("All statuses")}</option>{(Object.keys(COMMISSION_LABEL) as CommissionStatus[]).map((k) => <option key={k} value={k}>{t(COMMISSION_LABEL[k])}</option>)}</select>
        </div>
        {rows.error ? <LoadError error={rows.error} /> : rows.isLoading ? <Skeleton rows={4} /> : (
          <div className="cp-table-wrap"><table><thead><tr><th>{t("Booking")}</th><th>{t("Artist / Service")}</th><th>{t("Eligible value")}</th><th>{t("Rate")}</th><th>{t("Commission")}</th><th>{t("Date")}</th><th>{t("Status")}</th></tr></thead><tbody>
            {shown.length === 0 ? <tr><td colSpan={7}><Empty title={rows.data?.length ? "No matches" : "No commission yet"} text={rows.data?.length ? "No commission transactions match your search." : "Commission appears once one of your bookings is paid."} /></td></tr> : shown.map((r) => (
              <tr key={r.booking_id}><td><b>{r.reference}</b></td><td><b>{r.artist_name}</b><small>{r.service}</small></td><td>{money(r.eligible_value)}</td><td>{Number(r.rate)}%</td><td><b>{money(r.commission)}</b></td><td>{shortDate(r.credited_at)}</td><td><Status tone={COMMISSION_TONE[r.status as CommissionStatus] ?? "plain"}>{t(COMMISSION_LABEL[r.status as CommissionStatus] ?? r.status)}</Status></td></tr>
            ))}
          </tbody></table></div>
        )}
      </div>
    </section>
  );
}

export function Wallet() {
  const { uid, go } = usePortal();
  const { t } = useI18n();
  const wallet = useWallet(uid);
  const rows = useCommissions(uid);
  const payouts = usePayouts(uid);
  const w = wallet.data;
  const progress = w ? Math.min(100, Math.round((w.available / Math.max(1, w.minimum)) * 100)) : 0;
  const tx = [
    ...(rows.data ?? []).filter((r) => r.status === "available" || r.status === "reversed").map((r) => ({ id: `c-${r.booking_id}`, date: r.credited_at, ref: r.reference, type: r.status === "reversed" ? "Commission reversed" : "Commission credit", amount: Number(r.commission), sign: r.status === "reversed" ? 0 : 1, status: r.status === "reversed" ? "Reversed" : "Available", tone: r.status === "reversed" ? "red" : "green" })),
    ...(payouts.data ?? []).map((p) => ({ id: `w-${p.id}`, date: p.created_at, ref: p.reference, type: "Withdrawal", amount: Number(p.amount), sign: p.status === "rejected" ? 0 : -1, status: PAYOUT_LABEL[p.status as keyof typeof PAYOUT_LABEL] ?? p.status, tone: PAYOUT_TONE[p.status as keyof typeof PAYOUT_TONE] ?? "plain" })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  return (
    <section className="cp-page">
      <PageHead eyebrow="Earnings & finance" title="MY WALLET" text="Your commission balance and transaction ledger." />
      {wallet.error ? <LoadError error={wallet.error} /> : null}
      <div className="cp-grid">
        <div className="cp-card cp-span-7">
          <div className="cp-wallet-hero">
            <small>{t("AVAILABLE BALANCE")}</small><div className="cp-amount">{w ? money(w.available) : "…"}</div>
            <div className="cp-row cp-between"><small>{t("Minimum withdrawal")} {w ? moneyShort(w.minimum) : ""}</small><Status tone={w && w.available >= w.minimum ? "green" : "gold"}>{t(w && w.available >= w.minimum ? "Eligible to withdraw" : "Below minimum")}</Status></div>
            <div className="cp-progress" style={{ marginTop: 14 }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={t("Progress to minimum withdrawal")}><i style={{ width: `${progress}%` }} /></div>
            <button type="button" className="cp-btn cp-btn-gold" style={{ marginTop: 15 }} onClick={() => go("withdrawals")}>{t("Withdraw funds")} <ArrowUpRight aria-hidden="true" /></button>
          </div>
          <div className="cp-wallet-grid">
            <div className="cp-wallet-stat"><small>{t("Pending")}</small><b>{w ? moneyShort(w.pending + w.onHold) : "…"}</b></div>
            <div className="cp-wallet-stat"><small>{t("Processing")}</small><b>{w ? moneyShort(w.processing) : "…"}</b></div>
            <div className="cp-wallet-stat"><small>{t("Lifetime")}</small><b>{w ? moneyShort(w.lifetime) : "…"}</b></div>
          </div>
        </div>
        <div className="cp-card cp-span-5">
          <CardHead title="Wallet information" text="How your balance works" />
          <div className="cp-list">
            <div className="cp-list-item"><div className="cp-mini-icon" aria-hidden="true"><Clock /></div><div className="cp-grow"><b>{t("Pending balance")}</b><small>{t("Commission on paid bookings whose payment is still held for the artist, or held during a dispute.")}</small></div></div>
            <div className="cp-list-item"><div className="cp-mini-icon" aria-hidden="true"><CheckCircle2 /></div><div className="cp-grow"><b>{t("Available balance")}</b><small>{t("Commission released with the artist's payment, minus withdrawals.")}</small></div></div>
            <div className="cp-list-item"><div className="cp-mini-icon" aria-hidden="true"><Banknote /></div><div className="cp-grow"><b>{t("Processing balance")}</b><small>{t("Reserved for withdrawal requests that Master Admin has not paid yet.")}</small></div></div>
          </div>
        </div>
        <div className="cp-card cp-span-12">
          <CardHead title="Recent wallet transactions" aside={<button type="button" className="cp-text-link" onClick={() => go("history")}>{t("Commission history")} <ArrowUpRight size={13} aria-hidden="true" /></button>} />
          {rows.isLoading || payouts.isLoading ? <Skeleton /> : tx.length === 0 ? <Empty title="No transactions yet" text="Credits appear when a booking's payment is released to the artist." /> : (
            <div className="cp-table-wrap"><table><thead><tr><th>{t("Date")}</th><th>{t("Reference")}</th><th>{t("Type")}</th><th>{t("Amount")}</th><th>{t("Status")}</th></tr></thead><tbody>
              {tx.map((x) => <tr key={x.id}><td>{shortDate(x.date)}</td><td>{x.ref}</td><td>{t(x.type)}</td><td><b style={x.sign > 0 ? { color: "var(--success)" } : undefined}>{x.sign > 0 ? "+ " : x.sign < 0 ? "- " : ""}{money(x.amount)}</b></td><td><Status tone={x.tone as never}>{t(x.status)}</Status></td></tr>)}
            </tbody></table></div>
          )}
        </div>
      </div>
    </section>
  );
}

export function Withdrawals() {
  const { uid, openModal } = usePortal();
  const { t } = useI18n();
  const wallet = useWallet(uid);
  const payouts = usePayouts(uid);
  const w = wallet.data;
  return (
    <section className="cp-page">
      <PageHead eyebrow="Payouts" title="WITHDRAWALS" text="Request a payout of your available commission balance." actions={<button type="button" className="cp-btn cp-btn-gold" onClick={() => openModal({ type: "withdraw" })}><Plus aria-hidden="true" />{t("Request withdrawal")}</button>} />
      <div className="cp-grid">
        <div className="cp-card cp-span-5"><div className="cp-wallet-hero"><small>{t("AVAILABLE TO WITHDRAW")}</small><div className="cp-amount">{w ? money(w.available) : "…"}</div><small>{t("Minimum request")} {w ? moneyShort(w.minimum) : ""}{w && w.processing > 0 ? ` · ${moneyShort(w.processing)} ${t("processing")}` : ""}</small><div><button type="button" className="cp-btn cp-btn-gold" style={{ marginTop: 15 }} onClick={() => openModal({ type: "withdraw" })}>{t("Request withdrawal")} <ArrowUpRight aria-hidden="true" /></button></div></div></div>
        <div className="cp-card cp-span-7">
          <CardHead title="Withdrawal process" />
          <div className="cp-list">
            <div className="cp-list-item"><div className="cp-mini-icon">01</div><div className="cp-grow"><b>{t("Submit request")}</b><small>{t("Choose an amount; it is paid to your verified payout account.")}</small></div></div>
            <div className="cp-list-item"><div className="cp-mini-icon">02</div><div className="cp-grow"><b>{t("Admin review")}</b><small>{t("Master Admin reviews and approves the request.")}</small></div></div>
            <div className="cp-list-item"><div className="cp-mini-icon">03</div><div className="cp-grow"><b>{t("Payment processing")}</b><small>{t("The transfer is sent and the request is marked paid.")}</small></div></div>
          </div>
        </div>
        <div className="cp-card cp-span-12">
          <CardHead title="Withdrawal history" />
          {payouts.error ? <LoadError error={payouts.error} /> : payouts.isLoading ? <Skeleton /> : (
            <div className="cp-table-wrap"><table><thead><tr><th>{t("Request ID")}</th><th>{t("Request date")}</th><th>{t("Amount")}</th><th>{t("Payout account")}</th><th>{t("Status")}</th></tr></thead><tbody>
              {(payouts.data ?? []).length === 0 ? <tr><td colSpan={5}><Empty title="No withdrawals yet" text="Your requests and their status will be listed here." /></td></tr> : (payouts.data ?? []).map((p) => (
                <tr key={p.id}><td><b>{p.reference}</b></td><td>{shortDate(p.created_at)}</td><td><b>{money(p.amount)}</b></td><td>{accountLine(p.account_snapshot)}</td><td><Status tone={PAYOUT_TONE[p.status as keyof typeof PAYOUT_TONE] ?? "plain"}>{t(PAYOUT_LABEL[p.status as keyof typeof PAYOUT_LABEL] ?? p.status)}</Status>{p.admin_note && <small>{p.admin_note}</small>}</td></tr>
              ))}
            </tbody></table></div>
          )}
        </div>
      </div>
    </section>
  );
}

export function PayoutAccounts() {
  const { uid, openModal } = usePortal();
  const { t } = useI18n();
  const account = usePayoutAccount(uid);
  const payouts = usePayouts(uid);
  const refresh = useRefresh(uid);
  const a = account.data;
  const busyRequest = (payouts.data ?? []).some((p) => p.status === "submitted" || p.status === "approved");
  const remove = async () => {
    if (!confirm(t("Remove this payout account?"))) return;
    const { error } = await supabase.from("client_payout_accounts").delete().eq("user_id", uid);
    if (error) { toast.error(error.message); return; }
    toast.success(t("Payout account removed."));
    await refresh("account");
  };
  return (
    <section className="cp-page">
      <PageHead eyebrow="Account details" title="PAYOUT ACCOUNTS" text="Manage the bank account used to receive commission withdrawals." actions={<button type="button" className="cp-btn cp-btn-gold" onClick={() => openModal({ type: "payout-account" })}>{a ? t("Edit account") : <><Plus aria-hidden="true" />{t("Add account")}</>}</button>} />
      <div className="cp-card">
        <CardHead title="Saved payout method" text="Only verified accounts can be used for withdrawals. Editing an account sends it back for verification." />
        {account.error ? <LoadError error={account.error} /> : account.isLoading ? <Skeleton rows={1} /> : !a ? <Empty title="No payout account" text="Add the bank account where you want to receive commission." action={<button type="button" className="cp-btn cp-btn-gold" onClick={() => openModal({ type: "payout-account" })}>{t("Add account")}</button>} /> : (
          <div className="cp-list-item">
            <div className="cp-mini-icon" aria-hidden="true"><Landmark /></div>
            <div className="cp-grow"><b>{a.bank_name} · {a.holder_name}</b><small>{t("IBAN ending")} {a.iban.slice(-4)}{a.swift ? ` · SWIFT ${a.swift}` : ""} · {a.country}</small><small>{t("Updated")} {shortDate(a.updated_at)}</small></div>
            {a.verified_at ? <Status tone="green"><ShieldCheck size={12} aria-hidden="true" />{t("Verified")}</Status> : <Status tone="gold">{t("Awaiting verification")}</Status>}
            <button type="button" className="cp-tiny-btn" onClick={() => openModal({ type: "payout-account" })}>{t("Edit")}</button>
            <button type="button" className="cp-tiny-btn" disabled={busyRequest} title={busyRequest ? t("Wait until open withdrawal requests are finished") : undefined} onClick={remove} aria-label={t("Remove payout account")}><Trash2 size={13} aria-hidden="true" /></button>
          </div>
        )}
      </div>
    </section>
  );
}

export function Statements() {
  const { uid, email } = usePortal();
  const { t } = useI18n();
  const rows = useCommissions(uid);
  const payouts = usePayouts(uid);
  const profile = useProfile(uid);
  const periods = useMemo(() => statementPeriods(), []);
  const [period, setPeriod] = useState(periods[0]!.key);
  const [generated, setGenerated] = useState<string | null>(null);
  const p = periods.find((x) => x.key === generated);
  const s = p && rows.data && payouts.data ? statementSummary(rows.data, payouts.data, p.start, p.end) : null;
  const endLabel = p ? new Date(p.end.getTime() - 86_400_000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";
  return (
    <section className="cp-page">
      <PageHead eyebrow="Reporting" title="FINANCIAL STATEMENTS" text="A summary of your commission and withdrawal transactions for any period." />
      <div className="cp-card">
        <div className="cp-toolbar cp-no-print">
          <select className="cp-input" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label={t("Statement period")}>{periods.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
          <button type="button" className="cp-btn cp-btn-gold" disabled={rows.isLoading || payouts.isLoading} onClick={() => setGenerated(period)}><Download aria-hidden="true" />{t("Generate statement")}</button>
        </div>
        {rows.error || payouts.error ? <LoadError error={rows.error ?? payouts.error} /> : !s || !p ? <Empty title="Your statement preview" text="Select a period and generate a statement to view a summary." /> : (
          <div className="cp-card cp-statement">
            <div className="cp-row cp-between" style={{ flexWrap: "wrap" }}><div><b style={{ font: "26px var(--font-display)" }}>{t("Dealmaker · statement")}</b><div className="cp-muted cp-small">{p.label} · {profile.data?.display_name ?? email} · {email}</div></div><Status tone="green">{t("Generated")} {shortDate(new Date().toISOString())}</Status></div>
            <div className="cp-wallet-grid">
              <div className="cp-wallet-stat"><small>{t("Opening balance")}</small><b>{money(s.opening)}</b></div>
              <div className="cp-wallet-stat"><small>{t("Commission credited")}</small><b>{money(s.credited)}</b></div>
              <div className="cp-wallet-stat"><small>{t("Withdrawals paid")}</small><b>{money(s.withdrawn)}</b></div>
            </div>
            <div className="cp-row cp-between" style={{ margin: "14px 0" }}><span className="cp-muted">{t("Closing balance on")} {endLabel}</span><b style={{ font: "28px var(--font-display)" }}>{money(s.closing)}</b></div>
            {s.lines.length === 0 ? <p className="cp-muted cp-small">{t("No commission was credited and no withdrawals were paid in this period.")}</p> : (
              <div className="cp-table-wrap"><table><thead><tr><th>{t("Date")}</th><th>{t("Reference")}</th><th>{t("Description")}</th><th>{t("Amount")}</th></tr></thead><tbody>
                {s.lines.map((l, i) => <tr key={`${l.reference}-${i}`}><td>{shortDate(l.date)}</td><td>{l.reference}</td><td>{l.label}</td><td><b>{l.amount < 0 ? "- " : "+ "}{money(Math.abs(l.amount))}</b></td></tr>)}
              </tbody></table></div>
            )}
            <p className="cp-muted cp-small" style={{ marginTop: 12 }}>{t("Pending, on-hold and reversed commission is not included. Amounts in AED. Demo mode: no real money is moved.")}</p>
            <button type="button" className="cp-btn cp-btn-line cp-no-print" style={{ marginTop: 15 }} onClick={() => window.print()}><Printer aria-hidden="true" />{t("Print / Save PDF")}</button>
          </div>
        )}
      </div>
    </section>
  );
}
