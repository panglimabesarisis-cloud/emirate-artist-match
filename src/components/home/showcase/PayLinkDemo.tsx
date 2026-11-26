import { useEffect, useRef, useState } from "react";
import { Check, CreditCard, LoaderCircle, Lock, Plus, RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { PaidStamp } from "@/components/site/PaidStamp";
import "@/components/site/receipt.css";
import { DemoCursor, useCursor, useDemoScript, type Director } from "./demo";
import { LightBox } from "./LightBox";
import { StopAndWatch } from "./StopAndWatch";
import { PAY_LINES, demoTotals, money, typedLength, typedLines } from "./data";

type Phase = "empty" | "opening" | "typing" | "ready" | "loading" | "redirect" | "stripe" | "processing" | "returning" | "paid";
const FIELDS = [
  { key: "email", value: "aisha@example.com" },
  { key: "card", value: "4242 4242 4242 4242" },
  { key: "expiry", value: "12 / 29" },
  { key: "cvc", value: "123" },
  { key: "name", value: "Aisha R." },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];
const total = demoTotals(PAY_LINES);
const ALL = typedLength(PAY_LINES);

/** Invoice paper in the same layout as the Dealmaker invoice, filled while the job list is typed. */
function Paper({ typed, paid = false }: { typed: number; paid?: boolean }) {
  const lines = typedLines(PAY_LINES, typed);
  const sums = demoTotals(lines.map((line) => ({ label: line.label, amount: line.amount ?? 0 })));
  return (
    <article className="dm-receipt sc-paper" aria-label="Sample invoice">
      <header>
        <div><b className="dm-receipt-brand">DEALMAKER</b><small>Artist Management</small></div>
        <div className="dm-receipt-title"><h2>INVOICE</h2><span>DM-1025</span></div>
      </header>
      <div className="dm-receipt-stamp">{paid ? <PaidStamp /> : <span className="dm-receipt-unpaid">UNPAID</span>}</div>
      <dl className="dm-receipt-meta">
        <div><dt>Bill to</dt><dd>{typed ? "Aisha R." : "—"}</dd></div>
        <div><dt>Artist</dt><dd>DJ Sami</dd></div>
        <div><dt>Event</dt><dd>12 December 2026</dd></div>
      </dl>
      <table>
        <thead><tr><th scope="col">Description</th><th scope="col">Amount</th></tr></thead>
        <tbody>
          {lines.map((line, i) => <tr key={i}><td><b>{line.label}</b></td><td>{line.amount === null ? "" : money(line.amount)}</td></tr>)}
          {Array.from({ length: PAY_LINES.length - lines.length }, (_, i) => <tr key={`blank-${i}`} className="is-blank"><td><i /></td><td><i /></td></tr>)}
        </tbody>
      </table>
      <dl className="dm-receipt-totals">
        <dt>Subtotal</dt><dd>{money(sums.subtotal)}</dd>
        <dt>VAT 5%</dt><dd>{money(sums.vat)}</dd>
        <dt className="total">{paid ? "Total paid" : "Total due"}</dt><dd className="total">{money(sums.total)}</dd>
      </dl>
    </article>
  );
}

export function PayLinkDemo() {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("empty");
  const [typed, setTyped] = useState(0);
  const [form, setForm] = useState<Record<FieldKey, string>>({ email: "", card: "", expiry: "", cvc: "", name: "" });
  const [focus, setFocus] = useState<FieldKey | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const startAt = useRef<"intro" | "create" | "pay">("intro");
  const { cursor, move, click, hide } = useCursor(stage);

  const { ref, replay, reduced } = useDemoScript<HTMLDivElement>(async (d: Director) => {
    const from = startAt.current;
    startAt.current = "intro";
    setFocus(null); setForm({ email: "", card: "", expiry: "", cvc: "", name: "" }); hide();
    if (from !== "pay") {
      setPhase("empty"); setTyped(0);
      // The closed doors must be on screen for a moment, or there is nothing to slide open.
      if (from === "intro") { await d.wait(3000); await move(d, "create", 900); await click(d); } else await d.wait(350);
      setPhase("opening"); hide();
      await d.wait(2100);
      setPhase("typing");
      for (let i = 1; i <= ALL; i++) { setTyped(i); await d.wait(PAY_LINES.some((_, n) => i === typedLength(PAY_LINES.slice(0, n + 1))) ? 420 : 45); }
      setPhase("ready");
      await d.wait(1100);
      await move(d, "pay", 900);
      await click(d);
    }
    setTyped(ALL); setPhase("loading"); hide();
    await d.wait(1300);
    setPhase("redirect");
    await d.wait(1600);
    setPhase("stripe");
    await d.wait(800);
    for (const field of FIELDS) {
      await move(d, `field-${field.key}`, 520);
      await click(d);
      setFocus(field.key);
      for (let i = 1; i <= field.value.length; i++) { setForm((all) => ({ ...all, [field.key]: field.value.slice(0, i) })); await d.wait(48); }
      await d.wait(160);
    }
    setFocus(null);
    await move(d, "stripe-pay", 650);
    await click(d);
    setPhase("processing"); hide();
    await d.wait(1700);
    setPhase("returning");
    await d.wait(1600);
    setPhase("paid");
  });
  useEffect(() => { if (reduced) { setTyped(ALL); setPhase("paid"); } }, [reduced]);

  const start = (from: "create" | "pay") => { startAt.current = from; replay(); };
  const restart = () => { if (reduced) { setPhase("empty"); setTyped(0); return; } start("create"); };
  const create = () => { if (reduced) { setTyped(ALL); setPhase("ready"); return; } start("create"); };
  const pay = () => { if (reduced) { setPhase("paid"); return; } start("pay"); };
  const checkout = phase === "stripe" || phase === "processing";
  const open = phase !== "empty";
  const lines = typedLines(PAY_LINES, typed);

  return (
    <section className="sc sc-pay" aria-labelledby="sc-pay-title">
      <div className="wrap">
        <header className="sc-head is-split">
          <h2 className="serif" id="sc-pay-title">{t("One link to")} <em className="it">{t("pay the invoice")}</em></h2>
          <p>{t("Write the job, and Dealmaker turns it into an invoice. Your client opens one link, pays by card, and the booking updates by itself.")}</p>
        </header>
        <div ref={ref}>
          <LightBox tone="gold" className="sc-panel sc-pay-panel" dir="ltr">
            <div ref={stage} className={`sc-pay-stage is-${phase}`}>
              {phase === "paid" ? (
                <div className="sc-paid">
                  <div className="sc-paid-note">
                    <span className="sc-paid-tick"><Check aria-hidden="true" /></span>
                    <h3 className="serif" role="status">Invoice paid</h3>
                    <p>{money(total.total)} received. The booking for 12 December is confirmed.</p>
                    <button type="button" className="sc-btn sc-btn-gold" onClick={restart}><RotateCcw aria-hidden="true" />Create another invoice</button>
                  </div>
                  <Paper typed={ALL} paid />
                </div>
              ) : checkout ? (
                <div className="sc-stripe">
                  <div className="sc-stripe-sum">
                    <span className="sc-stripe-test">Test mode · demo</span>
                    <p>Pay Dealmaker</p>
                    <b>{money(total.total)}</b>
                    <ul>{PAY_LINES.map((line) => <li key={line.label}><span>{line.label}</span><span>{money(line.amount)}</span></li>)}<li><span>VAT 5%</span><span>{money(total.vat)}</span></li></ul>
                  </div>
                  <div className="sc-stripe-form" aria-label="Animated example of the Stripe checkout step">
                    <h3>Pay with card</h3>
                    <Field label="Email" name="email" value={form.email} focus={focus} />
                    <span className="sc-stripe-label">Card information</span>
                    <div className="sc-stripe-card">
                      <Field name="card" value={form.card} focus={focus} placeholder="1234 1234 1234 1234" icon />
                      <div><Field name="expiry" value={form.expiry} focus={focus} placeholder="MM / YY" /><Field name="cvc" value={form.cvc} focus={focus} placeholder="CVC" /></div>
                    </div>
                    <Field label="Name on card" name="name" value={form.name} focus={focus} />
                    <span className="sc-stripe-pay" data-demo="stripe-pay">{phase === "processing" ? <><LoaderCircle className="sc-turn" aria-hidden="true" />Processing…</> : <>Pay {money(total.total)}</>}</span>
                    <small><Lock aria-hidden="true" />Example only. Real payments happen on Stripe's secure page.</small>
                  </div>
                </div>
              ) : (
                <div className={`sc-compose-board${open ? " is-open" : ""}`}>
                  <div className="sc-pay-invoice"><Paper typed={phase === "empty" ? 0 : typed} /></div>
                  <div className="sc-pay-job">
                    <div className="sc-job">
                      <h3>Job list</h3>
                      <ol>
                        {(phase === "empty" ? [] : lines).map((line, i) => (
                          <li key={i}>
                            <span className={!line.done && line.amount === null ? "is-typing" : ""}>{line.label}</span>
                            <span className={!line.done && line.amount !== null ? "is-typing" : ""}>{line.amount ?? ""}</span>
                          </li>
                        ))}
                      </ol>
                      <span className="sc-job-add" aria-hidden="true"><Plus />Add a job</span>
                      <div className="sc-job-foot">
                        <p><span>Total with VAT</span><b>{money(demoTotals((phase === "empty" ? [] : lines).map((l) => ({ label: l.label, amount: l.amount ?? 0 }))).total)}</b></p>
                        {(phase === "ready" || phase === "loading") && <button type="button" data-demo="pay" className="sc-btn sc-btn-gold sc-pay-button" disabled={phase === "loading"} onClick={pay}>{phase === "loading" ? <><LoaderCircle className="sc-turn" aria-hidden="true" />Loading…</> : <><CreditCard aria-hidden="true" />Pay {money(total.total)}</>}</button>}
                      </div>
                    </div>
                  </div>
                  {/* Two gold doors, each carrying its half of the embossed name. */}
                  {["is-left", "is-right"].map((side) => (
                    <div key={side} className={`sc-curtain ${side}`} aria-hidden="true">
                      <span className="sc-brand"><b>DEALMAKER</b><small>AI AGENT MAKE A DEAL JUST FOR MONEY</small></span>
                    </div>
                  ))}
                  {phase === "empty" && <button type="button" data-demo="create" className="sc-btn sc-btn-gold sc-create" onClick={create}><Plus aria-hidden="true" />Create Invoice</button>}
                </div>
              )}
              {(phase === "redirect" || phase === "returning") && (
                <div className="sc-redirect" role="status">
                  <LoaderCircle className="sc-turn" aria-hidden="true" />
                  <b>{phase === "redirect" ? "Redirecting to Stripe…" : "Redirecting back to Dealmaker…"}</b>
                  <span className="sc-redirect-bar"><i /></span>
                </div>
              )}
              <DemoCursor cursor={cursor} />
            </div>
          </LightBox>
        </div>
        <div className="sc-foot"><span>{t("Illustrative demo. No real booking, message or payment is made.")}</span><button type="button" className="sc-link" onClick={restart}><RotateCcw aria-hidden="true" />{t("Replay")}</button></div>
        <StopAndWatch />
      </div>
    </section>
  );
}

/** A picture of a checkout field, not an input: visitors cannot type card details into this demo. */
function Field({ name, label, value, focus, placeholder, icon }: { name: FieldKey; label?: string; value: string; focus: FieldKey | null; placeholder?: string; icon?: boolean }) {
  return (
    <span className="sc-stripe-field">
      {label && <span className="sc-stripe-label">{label}</span>}
      <span data-demo={`field-${name}`} className={`sc-stripe-box${focus === name ? " is-focus" : ""}`}>
        <span className={value ? "" : "is-placeholder"}>{value || placeholder || ""}</span>
        {icon && <CreditCard aria-hidden="true" />}
      </span>
    </span>
  );
}
