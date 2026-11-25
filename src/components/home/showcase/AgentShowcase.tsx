import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, CreditCard, LoaderCircle, MessageSquare, Pencil, Receipt, RotateCcw, Save, Search, Send, Sparkles, UserRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { DemoCursor, useCursor, useDemoScript, type Director } from "./demo";
import { LightBox } from "./LightBox";
import { AGENT_STORY, STATUS_LABEL, applyAgent, initialAgent, type AgentState, type AgentStep, type Card, type ChatStatus, type EditorField, type InvoicePage, type ThreadId } from "./agent-script";
import { demoTotals, money } from "./data";
import { ScrollIntro } from "./ScrollIntro";
import { StopAndWatch } from "./StopAndWatch";

const OTHERS: { name: string; preview: string; time: string; status: ChatStatus }[] = [
  { name: "Omar K.", preview: "Can you play for 2 hours instead?", time: "09:12", status: "inquiry" },
  { name: "Priya S.", preview: "Invoice received, thank you.", time: "Yesterday", status: "pending" },
  { name: "Lina M.", preview: "See you on the 4th.", time: "Mon", status: "paid" },
];
const THREAD_IDS: ThreadId[] = ["client", "artist"];
const THREADS: Record<ThreadId, { name: string; initials: string }> = { client: { name: "Client", initials: "CL" }, artist: { name: "DJ Sami · Artist", initials: "DS" } };
const BOOKED: Record<number, { label: string; fresh?: boolean }> = { 4: { label: "Corporate gala" }, 12: { label: "Wedding · Aisha", fresh: true }, 19: { label: "Birthday" } };
const finalAgent = () => AGENT_STORY.reduce(applyAgent, initialAgent());

export function AgentShowcase() {
  const { t } = useI18n();
  const [chat, setChat] = useState<AgentState>(initialAgent);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<"inbox" | "calendar">("inbox");
  const [spinning, setSpinning] = useState(false);
  const [open, setOpen] = useState(false);
  const [ended, setEnded] = useState(false);
  const [mine, setMine] = useState(false);
  const [replies, setReplies] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const { cursor, move, click, hide } = useCursor(stageRef);

  const reset = () => { setChat(initialAgent()); setTyping(false); setBusy(null); setView("inbox"); setSpinning(false); setOpen(false); setEnded(false); setMine(false); setReplies([]); setDraft(""); hide(); };

  const perform = async (d: Director, step: AgentStep) => {
    const apply = () => setChat((state) => applyAgent(state, step));
    switch (step.kind) {
      case "say": {
        if (step.message.from === "ai") { setTyping(true); await d.wait(900); setTyping(false); } else await d.wait(800);
        apply();
        await d.wait(step.message.card ? 1900 : 1200);
        return;
      }
      case "switch": { await d.wait(500); await move(d, `thread-${step.thread}`, 900); await click(d); apply(); hide(); await d.wait(700); return; }
      case "press": {
        await move(d, `button-${step.button}`, 900); await click(d);
        if (step.button === "stripe") { setBusy("stripe"); await d.wait(1600); setBusy(null); }
        if (step.button === "open-invoice") { setBusy("redirect"); hide(); await d.wait(1900); setBusy(null); }
        apply(); hide(); await d.wait(step.button === "calendar" ? 100 : step.button === "open-invoice" ? 1500 : 800);
        return;
      }
      case "edit": { await move(d, "edit-invoice", 900); await click(d); apply(); await d.wait(600); return; }
      case "save": { await move(d, "save-invoice", 800); await click(d); apply(); await d.wait(1300); return; }
      case "pick": { await move(d, `choice-${step.choice}`, 900); await click(d); apply(); hide(); await d.wait(600); return; }
      case "fill": {
        await move(d, `field-${step.field}`, 650); await click(d);
        setChat((state) => applyAgent(state, { ...step, value: "" })); // the old value is replaced
        await d.wait(200);
        for (let i = 1; i <= step.value.length; i++) { const value = step.value.slice(0, i); setChat((state) => applyAgent(state, { ...step, value })); await d.wait(step.field === "extra" ? 45 : 130); }
        await d.wait(400);
        return;
      }
      case "send": { await move(d, "send-client", 800); await click(d); setBusy("back"); hide(); await d.wait(1900); setBusy(null); apply(); await d.wait(700); return; }
    }
  };
  const { ref, replay, stop, reduced } = useDemoScript<HTMLDivElement>(async (d) => {
    reset();
    await d.wait(700);
    for (const step of AGENT_STORY) await perform(d, step);
    setSpinning(true);
    await d.wait(1125); // the box is edge-on here, so the swap is invisible
    setView("calendar");
    await d.wait(700);
    setSpinning(false);
    await d.wait(700);
    await move(d, "booked-day", 1200);
    await click(d);
    setOpen(true);
    await d.wait(900);
    await move(d, "booking-card", 800);
    await d.wait(3500);
    hide();
    setEnded(true);
  }, 0.2, ready);
  useEffect(() => { if (reduced) setChat(finalAgent()); }, [reduced]);
  const messages = chat.chats[chat.thread];
  // Scrolls only the message list, never the page.
  useEffect(() => { const box = list.current; if (box) box.scrollTo({ top: box.scrollHeight, behavior: reduced ? "auto" : "smooth" }); }, [messages.length, typing, replies, chat.thread, reduced]);

  const takeOver = () => { stop(); setTyping(false); setBusy(null); setSpinning(false); setView("inbox"); setOpen(false); setEnded(false); hide(); setChat((state) => ({ ...state, page: null })); setMine(true); };
  const browse = (thread: ThreadId) => { if (!mine) { stop(); setTyping(false); setBusy(null); hide(); } setChat((state) => applyAgent(state, { kind: "switch", thread })); };
  const send = (e: FormEvent) => { e.preventDefault(); if (!draft.trim()) return; setReplies((r) => [...r, draft.trim()]); setDraft(""); };
  // With reduced motion there is no script to restart, so the same buttons switch the views directly.
  const restart = () => { if (!reduced) { replay(); return; } reset(); setChat(finalAgent()); };

  const who = THREADS[chat.thread];
  const lastChoices = messages.reduce((found, m, i) => (m.choices ? i : found), -1);
  const preview = (id: ThreadId) => { const last = chat.chats[id][chat.chats[id].length - 1]; return last?.text ?? last?.card?.title ?? "No messages yet"; };

  return (
    <section className="sc sc-pinned sc-agent" aria-labelledby="sc-agent-title">
      <ScrollIntro id="sc-agent-title" effect="tilt" onReady={setReady} title={t("See How Dealmaker Agent")} accent={t("Works For You")}
        teaser={[t("Watch Our"), t("Agent Work")]}
        text={t("Dealmaker Talent comes with an AI agent that answers every client's questions for you. Monitor the conversations and take over any chat whenever you want.")}>
        <div ref={ref} className="sc-spin-wrap">
          <div ref={stageRef} className={`sc-spin${spinning ? " is-spinning" : ""}`}>
            <LightBox tone="blue" className="sc-panel sc-inbox-panel" dir="ltr">
              {chat.page && view === "inbox" ? (
                <InvoiceView page={chat.page} onBack={() => browse("artist")} />
              ) : view === "inbox" ? (
                <div className="sc-inbox">
                  <aside className="sc-list">
                    <div className="sc-list-head"><h3 className="serif">Inbox</h3><span>{OTHERS.length + 2} chats</span></div>
                    <div className="sc-search"><Search aria-hidden="true" /><span>Search conversations</span></div>
                    <ul>
                      {THREAD_IDS.map((id) => (
                        <li key={id}>
                          <button type="button" data-demo={`thread-${id}`} className={`sc-thread${chat.thread === id ? " is-on" : ""}`} onClick={() => browse(id)}>
                            <span className={`sc-av${id === "artist" ? " is-artist" : ""}`}>{id === "client" ? <UserRound aria-hidden="true" /> : <>{THREADS[id].initials}<i>AI</i></>}</span>
                            <span className="sc-thread-text">
                              <span><b>{THREADS[id].name}</b><time>Now</time></span>
                              <span className="sc-preview">{preview(id)}</span>
                              <span className="sc-tags">{id === "client" ? <span className={`sc-label ${chat.status}`}>{STATUS_LABEL[chat.status]}</span> : <span className="sc-label is-artist">Artist</span>}{id === "artist" && chat.unread > 0 && <span className="sc-unread">{chat.unread}</span>}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                      {OTHERS.map((o) => (
                        <li className="sc-thread" key={o.name}>
                          <span className="sc-av">{o.name.slice(0, 1)}</span>
                          <span className="sc-thread-text"><span><b>{o.name}</b><time>{o.time}</time></span><span className="sc-preview">{o.preview}</span><span className={`sc-label ${o.status}`}>{STATUS_LABEL[o.status]}</span></span>
                        </li>
                      ))}
                    </ul>
                  </aside>
                  <div className="sc-conv">
                    <div className="sc-switch">{THREAD_IDS.map((id) => <button type="button" key={id} data-demo={`thread-${id}`} className={chat.thread === id ? "is-on" : ""} onClick={() => browse(id)}>{id === "client" ? "Client" : "Artist"}{id === "artist" && chat.unread > 0 && <i>{chat.unread}</i>}</button>)}</div>
                    <div className="sc-conv-head">
                      <span className={`sc-av${chat.thread === "artist" ? " is-artist" : ""}`}>{chat.thread === "client" ? <UserRound aria-hidden="true" /> : who.initials}</span>
                      <div><b>{who.name}</b>{mine ? <small><UserRound aria-hidden="true" />You are replying</small> : chat.thread === "artist" && <small><Sparkles aria-hidden="true" />AI agent is updating the artist</small>}</div>
                      {chat.thread === "client" && <span className={`sc-label ${chat.status}`}>{STATUS_LABEL[chat.status]}</span>}
                      <button type="button" className={`sc-btn ${mine ? "sc-btn-line" : "sc-btn-gold"}`} onClick={mine ? restart : takeOver}>{mine ? t("Hand back to AI") : t("Take over")}</button>
                    </div>
                    <div className="sc-messages" ref={list} key={chat.thread}>
                      {messages.map((m, i) => (
                        <div className={`sc-msg ${m.from === "ai" ? "ai" : "client"}`} key={i}>
                          {m.from === "ai" && <small><Sparkles aria-hidden="true" />Dealmaker Agent</small>}
                          {m.text && <p>{m.text}</p>}
                          {m.card && <CardView card={m.card} pressed={chat.pressed} busy={busy} />}
                          {m.choices && <span className="sc-choices">{m.choices.map((c, n) => <span key={c} data-demo={i === lastChoices ? `choice-${n}` : undefined} className={m.picked === n ? "is-picked" : ""}>{c}</span>)}</span>}
                        </div>
                      ))}
                      {typing && <div className="sc-msg ai is-typing" aria-hidden="true"><p><i /><i /><i /></p></div>}
                      {mine && <p className="sc-event is-note"><UserRound aria-hidden="true" />You took over. The AI agent is paused.</p>}
                      {replies.map((r, i) => <div className="sc-msg ai is-mine" key={i}><small>You</small><p>{r}</p></div>)}
                    </div>
                    <form className="sc-compose" onSubmit={send}>
                      <input value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!mine} maxLength={200} aria-label={t("Your reply (demo)")} placeholder={mine ? "Type your reply (demo, nothing is sent)" : "Take over to reply yourself"} />
                      <button type="submit" disabled={!mine} aria-label={t("Send")}><Send aria-hidden="true" /></button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="sc-cal">
                  <div className="sc-cal-head"><CalendarDays aria-hidden="true" /><h3 className="serif">December 2026</h3><span className="sc-cal-nav" aria-hidden="true"><ChevronLeft /><ChevronRight /></span><button type="button" className="sc-btn sc-btn-line" onClick={restart}><MessageSquare aria-hidden="true" />{t("Back to chat")}</button></div>
                  <div className="sc-cal-body">
                    <div className="sc-grid">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span className="sc-dow" key={d}>{d}</span>)}
                      <span className="sc-day is-blank" />
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                        const booking = BOOKED[day];
                        return booking ? (
                          <button type="button" key={day} data-demo={booking.fresh ? "booked-day" : undefined} className={`sc-day is-booked${booking.fresh ? " is-fresh" : ""}${booking.fresh && open ? " is-open" : ""}`} onClick={() => { if (booking.fresh) { stop(); hide(); setOpen(true); } }}><b>{day}</b><span>{booking.label}</span></button>
                        ) : <span className="sc-day" key={day}><b>{day}</b></span>;
                      })}
                    </div>
                    <aside className={`sc-booking${open ? " is-open" : ""}`} data-demo="booking-card" aria-hidden={!open}>
                      <span className="sc-label paid">Paid</span>
                      <h4 className="serif">Wedding · Aisha R.</h4>
                      <dl><dt>Date</dt><dd>Saturday 12 December</dd><dt>Time</dt><dd>8:00 PM – 11:00 PM</dd><dt>Venue</dt><dd>Hotel ballroom, Dubai Marina</dd><dt>Set</dt><dd>DJ set and sound system</dd><dt>Total paid</dt><dd>AED 3,255.00</dd></dl>
                      <p><Check aria-hidden="true" />Booked by your AI agent</p>
                    </aside>
                  </div>
                </div>
              )}
              {(busy === "redirect" || busy === "back") && (
                <div className="sc-loading" role="status">
                  <LoaderCircle className="sc-turn" aria-hidden="true" />
                  <b>{busy === "redirect" ? "Redirecting to invoice page…" : "Loading back to chat…"}</b>
                  <span className="sc-redirect-bar"><i /></span>
                </div>
              )}
              {ended && <div className="sc-ended"><button type="button" className="sc-btn sc-btn-gold" onClick={restart}><RotateCcw aria-hidden="true" />{t("Replay")}</button></div>}
              <DemoCursor cursor={cursor} />
            </LightBox>
            <span className="sc-spin-back serif" aria-hidden="true">DEALMAKER</span>
          </div>
        </div>
        <div className="sc-foot"><span>{t("Illustrative demo. No real booking, message or payment is made.")}</span>{reduced && view === "inbox" ? <button type="button" className="sc-link" onClick={() => { setView("calendar"); setOpen(true); }}><CalendarDays aria-hidden="true" />{t("View calendar")}</button> : <button type="button" className="sc-link" onClick={restart}><RotateCcw aria-hidden="true" />{t("Replay")}</button>}</div>
        <StopAndWatch active={ready} />
      </ScrollIntro>
    </section>
  );
}

function CardView({ card, pressed, busy }: { card: Card; pressed: string[]; busy: string | null }) {
  const Icon = card.title.startsWith("Invoice") ? Receipt : ClipboardList;
  const button = card.button;
  return (
    <span className={`sc-doc${card.paid ? " is-paid" : ""}`}>
      <span className="sc-doc-head"><Icon aria-hidden="true" /><b>{card.title}</b>{card.paid && <span className="sc-label paid">Paid</span>}</span>
      {card.blank?.map((field) => <span className="sc-doc-blank" key={field}><span>{field}</span><i /></span>)}
      {card.rows?.map(([label, value]) => <span className={`sc-doc-row${label === "Total" ? " is-total" : ""}`} key={label}><span>{label}</span><span>{value}</span></span>)}
      {button && (
        <span className={`sc-doc-button${button.id === "stripe" ? " is-stripe" : ""}${pressed.includes(button.id) ? " is-done" : ""}`} data-demo={`button-${button.id}`}>
          {busy === button.id ? <><LoaderCircle className="sc-turn" aria-hidden="true" />Redirecting to Stripe…</> : <>{button.id === "stripe" ? <CreditCard aria-hidden="true" /> : button.id === "calendar" ? <CalendarDays aria-hidden="true" /> : <Receipt aria-hidden="true" />}{button.label}</>}
        </span>
      )}
    </span>
  );
}

/** The invoice page the artist lands on. A picture of a form: the pointer fills it, visitors cannot type in it. */
function InvoiceView({ page, onBack }: { page: InvoicePage; onBack: () => void }) {
  const total = demoTotals([{ label: "price", amount: Number(page.price) || 0 }, { label: "extra", amount: Number(page.extraPrice) || 0 }]);
  const field = (name: EditorField, placeholder: string, amount = false) => (
    <span data-demo={`field-${name}`} className={`sc-cell${page.editing ? " is-editing" : ""}${amount ? " is-amount" : ""}${page[name] ? "" : " is-empty"}`}>
      {page[name] ? (amount && !page.editing ? money(Number(page[name])) : page[name]) : placeholder}
    </span>
  );
  return (
    <div className="sc-invpage">
      <div className="sc-inv-top"><button type="button" onClick={onBack}><ArrowLeft aria-hidden="true" />Inbox</button><b>Invoice page</b><small>Artist view</small></div>
      <article className="sc-sheet">
        <div className="sc-sheet-head"><b>DEALMAKER</b><span>INVOICE DM-1024<em>{page.saved ? "Saved" : page.editing ? "Editing" : "Draft"}</em></span></div>
        <dl><div><dt>Bill to</dt><dd>Aisha Rahman</dd></div><div><dt>Event</dt><dd>Wedding · 12 December 2026</dd></div><div><dt>Time</dt><dd>8:00 PM – 11:00 PM</dd></div></dl>
        <div className="sc-sheet-row is-head"><span>Description</span><span>Amount</span></div>
        <div className="sc-sheet-row"><span>DJ set · 3 hours</span>{field("price", "Price", true)}</div>
        <div className="sc-sheet-row">{field("extra", page.editing ? "Additional requirement" : "No additional requirement")}{field("extraPrice", page.editing ? "Price" : "—", true)}</div>
        <div className="sc-sheet-row is-sum"><span>VAT 5%</span><span>{money(total.vat)}</span></div>
        <div className="sc-sheet-row is-total"><span>Total</span><b>{money(total.total)}</b></div>
      </article>
      <div className="sc-inv-actions">
        {page.editing ? (
          <span className="sc-btn sc-btn-gold" data-demo="save-invoice"><Save aria-hidden="true" />Save</span>
        ) : (
          <>
            <span className="sc-btn sc-btn-line" data-demo="edit-invoice"><Pencil aria-hidden="true" />Edit</span>
            {page.saved ? <span className="sc-btn sc-btn-gold" data-demo="send-client"><Send aria-hidden="true" />Send to client</span> : <span className="sc-btn sc-btn-gold" data-demo="approve-invoice"><Check aria-hidden="true" />Approve</span>}
          </>
        )}
      </div>
    </div>
  );
}
