import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { Fragment, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadCsv, toCsv } from "@/lib/csv";
import { ACCOUNTS, accountStatement, ledgerReport, type LedgerLine } from "@/lib/admin-documents";
import { A4Dialog } from "./documents/A4Dialog";
import { ListState } from "./artists/parts";

const money = (n: number | string) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amount = (n: number | string) => (Number(n) ? money(n) : "—");
const day = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });
const shift = (value: string, days: number) => { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const periodStart = (preset: string, to: string) => (preset === "month" ? `${to.slice(0, 7)}-01` : preset === "30" ? shift(to, -29) : preset === "90" ? shift(to, -89) : preset === "year" ? `${to.slice(0, 4)}-01-01` : shift(to, -3650));
const typeOf = (account: string) => ACCOUNTS.find((a) => a.name === account)?.type ?? "Liability";

/** Every journal up to the end date, read in pages so a long ledger is never cut short. */
async function readLedger(to: string) {
  const all: LedgerLine[] = [];
  for (let at = 0; at < 200_000; at += 1000) {
    const { data, error } = await supabase.rpc("admin_ledger", { _from: shift(to, -3650), _to: to }).range(at, at + 999);
    if (error) throw new Error("Unable to load the ledger");
    all.push(...((data ?? []) as LedgerLine[]));
    if ((data?.length ?? 0) < 1000) return all;
  }
  throw new Error("The ledger is too large to show in one report");
}

export function AdminLedger() {
  const [preset, setPreset] = useState("year");
  const [to, setTo] = useState(today);
  const [customFrom, setCustomFrom] = useState(() => `${today().slice(0, 7)}-01`);
  const from = preset === "custom" ? customFrom : periodStart(preset, to);
  const valid = !!from && !!to && from <= to;
  const query = useQuery({ queryKey: ["admin-ledger", to], queryFn: () => readLedger(to), enabled: !!to });
  const report = ledgerReport(valid ? (query.data ?? []) : [], from);
  const [shown, setShown] = useState(40);
  const [statement, setStatement] = useState(false);
  const closing = (name: string) => report.accounts.find((a) => a.name === name)?.closing ?? 0;
  const journals = [...report.period.reduce((map, l) => map.set(l.journal, [...(map.get(l.journal) ?? []), l]), new Map<string, LedgerLine[]>()).values()];
  const periodLabel = valid ? `${day(from)} to ${day(to)}` : "Choose a valid period";
  const kpis: [string, number, string][] = [
    ["Platform revenue", report.revenue, "Commission, subscriptions and credits, before VAT"],
    ["Net platform result", report.revenue - report.expense, "Revenue less client commission expense"],
    ["Customer funds in escrow", closing("Customer funds held in escrow"), "Closing balance, not platform revenue"],
    ["VAT payable", closing("VAT payable (5%)"), "Closing balance owed to the tax authority"],
  ];
  const exportCsv = () => downloadCsv(`dealmaker-journal-${from}-${to}.csv`, toCsv(report.period, [["Date", (l) => l.entry_date], ["Journal", (l) => l.journal.split(":")[0]], ["Reference", (l) => l.reference], ["Ledger account", (l) => l.account], ["Account type", (l) => typeOf(l.account)], ["Debit AED", (l) => Number(l.debit).toFixed(2)], ["Credit AED", (l) => Number(l.credit).toFixed(2)], ["Memo", (l) => l.memo]]));

  const trial = (
    <table><thead><tr><th>Ledger account</th><th>Type</th><th className="text-end">Opening</th><th className="text-end">Debit</th><th className="text-end">Credit</th><th className="text-end">Closing</th></tr></thead>
      <tbody>{report.accounts.map((a) => <tr key={a.name}><td><b>{a.name}</b></td><td>{a.type}</td><td className="admin-money text-end">{amount(a.opening)}</td><td className="admin-money text-end">{amount(a.debit)}</td><td className="admin-money text-end">{amount(a.credit)}</td><td className="admin-money text-end"><b>{money(a.closing)}</b></td></tr>)}</tbody>
      <tfoot><tr><td colSpan={3}><b>Total movement</b></td><td className="admin-money text-end"><b>{money(report.debit)}</b></td><td className="admin-money text-end"><b>{money(report.credit)}</b></td><td /></tr></tfoot></table>
  );

  return (
    <div className="space-y-5">
      <div className="admin-toolbar">
        <Select value={preset} onValueChange={(v) => { setPreset(v); setShown(40); }}><SelectTrigger className="w-44" aria-label="Reporting period"><SelectValue /></SelectTrigger><SelectContent>{[["month", "This month"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["year", "This year"], ["all", "All time"], ["custom", "Custom period"]].map(([value, label]) => <SelectItem key={value} value={value!}>{label}</SelectItem>)}</SelectContent></Select>
        {preset === "custom" && <label className="flex items-center gap-2 text-sm">From<Input type="date" className="w-40" value={customFrom} max={to} onChange={(e) => setCustomFrom(e.target.value)} /></label>}
        <label className="flex items-center gap-2 text-sm">Until<Input type="date" className="w-40" value={to} max={today()} onChange={(e) => setTo(e.target.value)} /></label>
        <Button variant="outline" disabled={!report.period.length} onClick={exportCsv}><Download />Export journal CSV</Button>
        <Button variant="outline" disabled={!report.accounts.length} onClick={() => setStatement(true)}><Printer />Print statement</Button>
      </div>
      <div className="adm-grid is-kpi">{kpis.map(([label, value, note]) => <section key={label} className="adm-panel !gap-1"><span className="adm-meta">{label}</span><b className="font-display text-4xl font-normal">AED {money(value)}</b><span className="adm-meta">{note}</span></section>)}</div>
      <ListState pending={query.isPending} error={query.error} empty={!valid ? "The start date must be before the end date." : report.accounts.length ? null : "No money movement is recorded yet."}>
        <p className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span className={`adm-pill is-${report.balanced ? "paid" : "unpaid"}`}>{report.balanced ? "Balanced" : "Out of balance"}</span>{periodLabel} · all amounts in AED · {journals.length} journal entries</p>
        <Tabs defaultValue="trial">
          <TabsList><TabsTrigger value="trial">Trial balance</TabsTrigger><TabsTrigger value="accounts">By ledger account</TabsTrigger><TabsTrigger value="journal">Journal</TabsTrigger></TabsList>
          <TabsContent value="trial" className="mt-4"><div className="admin-table-wrap">{trial}</div></TabsContent>
          <TabsContent value="accounts" className="mt-4 space-y-4">
            {report.accounts.map((a) => { const entries = accountStatement(report.period, a.name, a.opening); return (
              <details key={a.name} className="adm-panel" open={entries.length > 0 && entries.length <= 12}>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3"><span><b className="font-display text-2xl font-normal">{a.name}</b><span className="adm-meta ms-3">{a.type} · {entries.length} entries</span></span><b className="admin-money">AED {money(a.closing)}</b></summary>
                <div className="admin-table-wrap mt-3"><table><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th className="text-end">Debit</th><th className="text-end">Credit</th><th className="text-end">Balance</th></tr></thead><tbody>
                  <tr><td colSpan={5}>Opening balance</td><td className="admin-money text-end">{money(a.opening)}</td></tr>
                  {entries.map((l, i) => <tr key={`${l.journal}-${i}`}><td className="whitespace-nowrap">{day(l.entry_date)}</td><td><b>{l.reference}</b></td><td>{l.memo}</td><td className="admin-money text-end">{amount(l.debit)}</td><td className="admin-money text-end">{amount(l.credit)}</td><td className="admin-money text-end">{money(l.balance)}</td></tr>)}
                </tbody><tfoot><tr><td colSpan={3}><b>Closing balance</b></td><td className="admin-money text-end"><b>{money(a.debit)}</b></td><td className="admin-money text-end"><b>{money(a.credit)}</b></td><td className="admin-money text-end"><b>{money(a.closing)}</b></td></tr></tfoot></table></div>
              </details>
            ); })}
          </TabsContent>
          <TabsContent value="journal" className="mt-4 space-y-3">
            {journals.length ? <div className="admin-table-wrap"><table><thead><tr><th>Date</th><th>Reference</th><th>Ledger account</th><th>Description</th><th className="text-end">Debit</th><th className="text-end">Credit</th></tr></thead>
              {journals.slice(0, shown).map((entry) => <tbody key={entry[0]!.journal} className="adm-journal">{entry.map((l, i) => <Fragment key={`${l.account}-${i}`}><tr>
                {i === 0 && <><td rowSpan={entry.length} className="whitespace-nowrap align-top">{day(l.entry_date)}</td><td rowSpan={entry.length} className="align-top"><b>{l.reference}</b><div className="admin-row-detail capitalize">{l.journal.split(":")[0]}</div></td></>}
                <td className={Number(l.credit) ? "!ps-8" : "font-bold"}>{l.account}</td><td>{l.memo}</td><td className="admin-money text-end">{amount(l.debit)}</td><td className="admin-money text-end">{amount(l.credit)}</td>
              </tr></Fragment>)}</tbody>)}
            </table></div> : <p className="adm-meta">No journal entry in this period.</p>}
            {journals.length > shown && <Button variant="outline" onClick={() => setShown((n) => n + 40)}>Show more entries</Button>}
          </TabsContent>
        </Tabs>
      </ListState>
      {statement && <A4Dialog title="Trial balance" onClose={() => setStatement(false)}>
        <article data-paper dir="ltr" className="a4-sheet is-ledger"><header><div><b className="a4-brand">DEALMAKER</b><small>Trial balance</small></div><div className="a4-head-right"><h2>STATEMENT</h2><span>{periodLabel}</span><span>Amounts in AED</span></div></header>
          <div className="a4-ledger">{trial}</div>
          <footer><p>{report.balanced ? "Debits equal credits." : "Debits and credits do not match."} Derived from recorded payments, releases, refunds and payouts. Sandbox payments: no real money is moved.</p></footer></article>
      </A4Dialog>}
    </div>
  );
}
