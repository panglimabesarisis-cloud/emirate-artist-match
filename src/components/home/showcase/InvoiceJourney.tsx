import { useEffect, useRef, useState } from "react";
import { Check, FileText, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useDemoScript } from "./demo";
import { LightBox } from "./LightBox";
import { StopAndWatch } from "./StopAndWatch";
import { money } from "./data";

type Step = {
  tab: string; text: string; date: string; heading: string;
  rows: { label: string; note: string; value?: string }[]; checks: string[];
  side: { badge: string; title: string; note: string; preview: string; action: string; after: string };
};
const STEPS: Step[] = [
  {
    tab: "Create", text: "The agent drafts the invoice from the chat and your rate card, with 5% VAT already worked out.", date: "2 Dec", heading: "Drafted from the chat",
    rows: [{ label: "DJ set · 3 hours", note: "Your rate card", value: money(2500) }, { label: "Sound system", note: "Rate card add-on", value: money(600) }, { label: "VAT 5%", note: "Added automatically", value: money(155) }],
    checks: ["12 December is free in your calendar", "Prices match your rate card", "Client details come from the chat"],
    side: { badge: "Waits for you", title: "Approve the invoice", note: "Nothing reaches the client before you say yes.", preview: "Total AED 3,255.00 · 30% deposit AED 976.50", action: "Approve draft", after: "Approving moves it to Send." },
  },
  {
    tab: "Send", text: "Your client gets one secure link with the invoice. The status updates in your inbox.", date: "2 Dec", heading: "Ready to send",
    rows: [{ label: "To", note: "From the chat", value: "Aisha R." }, { label: "Invoice", note: "DM-1024", value: money(3255) }, { label: "Payment", note: "Secure card checkout", value: "Stripe" }],
    checks: ["Totals match the approved draft", "The link opens only this booking", "Phone numbers stay private until booking"],
    side: { badge: "Waits for you", title: "Send to Aisha", note: "It goes out in your name.", preview: "Hi Aisha, here is your invoice for Saturday 12 December. You can pay the AED 976.50 deposit from this link.", action: "Send invoice", after: "Your client receives the link." },
  },
  {
    tab: "Get paid", text: "The client pays by card. Dealmaker holds the money until the event is completed, then releases it to you.", date: "3 Dec", heading: "Payment received",
    rows: [{ label: "Deposit", note: "Paid by card", value: money(976.5) }, { label: "Balance", note: "Due before the event", value: money(2278.5) }, { label: "Held by Dealmaker", note: "Released after the show", value: money(976.5) }],
    checks: ["Booking confirmed in your calendar", "Receipt sent to your client", "Balance reminder shown on the invoice"],
    side: { badge: "Done", title: "Your date is booked", note: "You perform, Dealmaker handles the payment.", preview: "Saturday 12 December · 8:00 PM · Dubai Marina", action: "Start again", after: "See the three steps once more." },
  },
];

export function InvoiceJourney() {
  const { t } = useI18n();
  const [active, setActive] = useState(0);
  const [bar, setBar] = useState({ top: 0, height: 0 });
  const list = useRef<HTMLDivElement>(null);
  const { ref, stop } = useDemoScript<HTMLDivElement>(async (d) => {
    for (let i = 0; ; i = (i + 1) % STEPS.length) { setActive(i); await d.wait(6000); }
  });
  // The highlight slides to whichever tab is open.
  useEffect(() => {
    const place = () => { const tab = list.current?.querySelectorAll<HTMLElement>("[role=tab]")[active]; if (tab) setBar({ top: tab.offsetTop, height: tab.offsetHeight }); };
    place();
    const observer = new ResizeObserver(place);
    if (list.current) observer.observe(list.current);
    return () => observer.disconnect();
  }, [active]);
  const choose = (index: number) => { stop(); setActive((index + STEPS.length) % STEPS.length); };
  const step = STEPS[active]!;

  return (
    <section className="sc sc-journey" aria-labelledby="sc-journey-title">
      <div className="wrap">
        <header className="sc-head is-split">
          <h2 className="serif" id="sc-journey-title">{t("One invoice,")} <em className="it">{t("start to finish")}</em></h2>
          <p>{t("From the first question to a paid booking: the agent prepares each step, and you approve what matters.")}</p>
        </header>
        <div ref={ref} className="sc-journey-grid">
          <div ref={list} className="sc-tabs" role="tablist" aria-orientation="vertical" aria-label={t("Invoice steps")}>
            <span className="sc-tabs-bar" aria-hidden="true" style={{ transform: `translateY(${bar.top}px)`, height: bar.height }} />
            {STEPS.map((s, i) => (
              <button key={s.tab} type="button" role="tab" id={`sc-tab-${i}`} aria-selected={i === active} aria-controls="sc-journey-panel" tabIndex={i === active ? 0 : -1} onClick={() => choose(i)}
                onKeyDown={(e) => { const move = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0; if (!move) return; e.preventDefault(); choose(active + move); (e.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[role=tab]")[(active + move + STEPS.length) % STEPS.length])?.focus(); }}>
                <span><i>0{i + 1}</i>{t(s.tab)}</span><small>{t(s.text)}</small>
              </button>
            ))}
          </div>
          <LightBox tone={active === 2 ? "gold" : "blue"} className="sc-panel sc-journey-panel" dir="ltr">
            <div className="sc-journey-body" role="tabpanel" id="sc-journey-panel" aria-labelledby={`sc-tab-${active}`} key={active}>
              <div className="sc-work">
                <div className="sc-work-head"><span><Sparkles aria-hidden="true" />Dealmaker Agent</span><time>{step.date}</time></div>
                <h3>{step.heading}</h3>
                <ul className="sc-rows">{step.rows.map((row, i) => <li key={row.label} style={{ animationDelay: `${120 + i * 110}ms` }}><span><b>{row.label}</b><small>{row.note}</small></span><span>{row.value}</span></li>)}</ul>
                <h3>Checked</h3>
                <ul className="sc-checks">{step.checks.map((c, i) => <li key={c} style={{ animationDelay: `${480 + i * 110}ms` }}><Check aria-hidden="true" />{c}</li>)}</ul>
              </div>
              <div className="sc-side">
                <span className={`sc-badge${active === 2 ? " is-done" : ""}`}>{step.side.badge}</span>
                <h3>{step.side.title}</h3>
                <p>{step.side.note}</p>
                <div className="sc-mail"><FileText aria-hidden="true" /><span>{step.side.preview}</span></div>
                <button type="button" className="sc-btn sc-btn-gold" onClick={() => choose(active + 1)}>{step.side.action}</button>
                <small>{step.side.after}</small>
              </div>
            </div>
          </LightBox>
        </div>
        <p className="sc-foot"><span>{t("Illustrative demo. No real booking, message or payment is made.")}</span></p>
        <StopAndWatch />
      </div>
    </section>
  );
}
