import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Ban, CalendarCheck, CalendarX2, Check, CheckCheck, ClipboardList, Clock3, Mic, MoreVertical, Pause, Phone, Play, Receipt, RotateCcw, Search, Send, Sparkles, Video } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { DemoCursor, useCursor, useDemoScript, type Director } from "./showcase/demo";
import { AGENT_CHAPTER, CHAPTERS, CONTACTS, STORY, applyStep, chapterStart, initialPhone, phoneAt, type Card, type Overlay, type PhoneState, type Step } from "./phone-stories";
import "./phone-stories.css";

const CARD_ICONS: Record<Card["kind"], typeof Receipt> = { form: ClipboardList, invoice: Receipt, calendar: CalendarCheck };
const OVERLAY_ICONS: Record<Overlay["tone"], typeof Ban> = { block: Ban, ask: Search, later: Clock3, trouble: CalendarX2, agent: Sparkles };

/** The artist's phone: a day of chats by hand, then the same work with the Dealmaker agent. */
export function PhoneStories() {
  const { t } = useI18n();
  const [phone, setPhone] = useState<PhoneState>(initialPhone);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [paused, setPaused] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const from = useRef(0);
  const { cursor, move, click, hide } = useCursor(stage);

  const perform = async (d: Director, step: Step) => {
    const apply = () => setPhone((state) => applyStep(state, step));
    switch (step.kind) {
      case "chapter": apply(); return;
      case "list": { await move(d, "back", 380); await click(d); apply(); await d.wait(650); return; }
      case "incoming": { await d.wait(420); apply(); await d.wait(500); return; }
      case "open": { await move(d, `thread-${step.chat}`, 600); await click(d); apply(); hide(); await d.wait(850); return; }
      case "say": {
        const { message } = step;
        if (message.event) { await d.wait(700); apply(); await d.wait(900); return; }
        if (message.mine && !message.ai) {
          for (let i = 1; i <= message.text.length; i += 2) { setDraft(message.text.slice(0, i + 1)); await d.wait(30); }
          await move(d, "send", 320); await click(d); setDraft(""); apply(); hide();
          await d.wait(750);
          return;
        }
        setTyping(true); await d.wait(message.text.length > 40 ? 1000 : 600); setTyping(false); apply();
        await d.wait(Math.min(2200, 450 + message.text.length * 18) + (message.card ? 700 : 0));
        return;
      }
      case "pick": { await d.wait(500); await move(d, `choice-${step.choice}`, 600); await click(d); apply(); hide(); await d.wait(400); return; }
      case "menu": { await move(d, "menu", 700); await click(d); apply(); await d.wait(500); return; }
      case "block": { await move(d, "block", 550); await click(d); apply(); hide(); await d.wait(700); return; }
      case "overlay": { hide(); apply(); await d.wait(step.overlay.tone === "trouble" ? 4600 : step.overlay.detail ? 3200 : 2300); setPhone((state) => ({ ...state, overlay: null })); await d.wait(250); return; }
      case "invoice": { apply(); await d.wait(1700); return; }
      case "approve": { await move(d, "approve", 800); await click(d); apply(); await d.wait(1300); hide(); return; }
    }
  };

  const { ref, replay, reduced } = useDemoScript<HTMLDivElement>(async (d) => {
    let at = from.current;
    from.current = 0;
    for (;;) {
      setPhone(phoneAt(at)); setTyping(false); setDraft(""); hide();
      await d.wait(900);
      for (let i = at; i < STORY.length; i++) await perform(d, STORY[i]!);
      await d.wait(4000);
      at = 0;
    }
  }, 0.3, !paused);

  // With reduced motion nothing plays by itself: each chapter button shows how that chapter ends.
  const showEnd = (chapter: number) => { const end = chapter === CHAPTERS.length - 1 ? STORY.length - 1 : chapterStart(chapter + 1); setPhone({ ...phoneAt(end), chapter, overlay: null }); };
  useEffect(() => { if (reduced) showEnd(0); }, [reduced]);
  const jump = (chapter: number) => { if (reduced) { showEnd(chapter); return; } from.current = chapterStart(chapter); setPaused(false); replay(); };
  const messages = phone.threads[phone.chat] ?? [];
  // Scrolls only the phone, never the page.
  useEffect(() => { const list = body.current; if (list) list.scrollTo({ top: phone.screen === "chat" ? list.scrollHeight : 0, behavior: reduced ? "auto" : "smooth" }); }, [messages.length, typing, phone.screen, phone.chat, reduced]);

  const contact = CONTACTS[phone.chat]!;
  const withAgent = phone.chapter >= AGENT_CHAPTER;
  const blocked = phone.blocked.includes(phone.chat);
  const asking = messages.reduce((found, message, n) => (message.choices ? n : found), -1);
  const OverlayIcon = phone.overlay ? OVERLAY_ICONS[phone.overlay.tone] : null;

  return (
    <div ref={ref} className={`pane pane-a phone-stories${withAgent ? " phone-solution" : ""}`} role="region" aria-label={t("Your phone today")}>
      <div className="pane-h"><span>{t(withAgent ? "Your phone with Dealmaker" : "Your phone today")}</span><span className="phone-example">{t("Illustrative story")}</span></div>
      <div ref={stage} className="wa" dir="ltr">
        {phone.screen === "list" ? (
          <>
            <div className="wa-top"><b>{withAgent ? "Dealmaker chats" : "Chats"}</b><Search aria-hidden="true" /><MoreVertical aria-hidden="true" /></div>
            <div className="wa-body wa-list" ref={body}>
              {phone.order.map((id) => {
                const who = CONTACTS[id]!; const last = [...(phone.threads[id] ?? [])].pop(); const unread = phone.unread[id] ?? 0;
                return (
                  <div className={`wa-thread${unread ? " is-unread" : ""}`} key={id} data-demo={`thread-${id}`}>
                    <span className="wa-av">{who.initials}</span>
                    <span className="wa-thread-text"><b>{who.name}</b><span>{last?.mine && <CheckCheck aria-hidden="true" />}{last?.text}</span></span>
                    <span className="wa-meta"><time>now</time>{unread > 0 && <i>{unread}</i>}</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : phone.screen === "chat" ? (
          <>
            <div className="wa-top is-chat">
              <span data-demo="back" className="wa-back"><ArrowLeft aria-hidden="true" /></span>
              <span className={`wa-av${contact.kind === "assistant" ? " is-agent" : ""}`}>{contact.initials}</span>
              <span className="wa-who"><b>{contact.name}</b><small>{typing ? "typing…" : contact.note}</small></span>
              <Video aria-hidden="true" /><Phone aria-hidden="true" /><span data-demo="menu" className="wa-menu-button"><MoreVertical aria-hidden="true" /></span>
              {phone.menu && <div className="wa-menu"><span>View contact</span><span>Mute</span><span data-demo="block" className="is-danger">Block</span></div>}
            </div>
            <div className="wa-body wa-chat" ref={body}>
              <p className="wa-day">Today</p>
              {messages.map((m, i) => m.event ? <p className="wa-event" key={i}>{m.text}</p> : (
                <div className={`wa-msg${m.mine ? " is-mine" : ""}${m.ai ? " is-ai" : ""}`} key={i}>
                  {m.ai && <small><Sparkles aria-hidden="true" />Dealmaker Agent</small>}
                  <p>{m.text}</p>
                  {m.card && <Attachment card={m.card} />}
                  {m.choices && <span className="wa-choices">{m.choices.map((c, n) => <span key={c} data-demo={i === asking ? `choice-${n}` : undefined} className={m.picked === n ? "is-picked" : ""}>{c}</span>)}</span>}
                  <time>now{m.mine && <CheckCheck aria-hidden="true" />}</time>
                </div>
              ))}
              {typing && <div className="wa-msg wa-typing" aria-hidden="true"><p><i /><i /><i /></p></div>}
              {blocked && <p className="wa-event is-block"><Ban aria-hidden="true" />You blocked this contact</p>}
            </div>
            <div className="wa-compose"><span className={draft ? "" : "is-empty"}>{draft || "Message"}</span><i data-demo="send">{draft ? <Send aria-hidden="true" /> : <Mic aria-hidden="true" />}</i></div>
          </>
        ) : (
          <>
            <div className="wa-top is-agent-top"><Sparkles aria-hidden="true" /><b>Dealmaker Agent</b></div>
            <div className="wa-body wa-approve" ref={body}>
              <p>Please check this invoice before I send it to Layla.</p>
              <article>
                <header><b>DEALMAKER</b><span>INVOICE DM-1026</span></header>
                <dl><dt>Bill to</dt><dd>Layla · Wedding</dd><dt>Event</dt><dd>12 December 2026, 8 PM</dd></dl>
                <ul><li><span>DJ set · 3 hours</span><span>2,500.00</span></li><li><span>Sound system</span><span>600.00</span></li><li><span>VAT 5%</span><span>155.00</span></li></ul>
                <p className="wa-total"><span>Total AED</span><b>3,255.00</b></p>
              </article>
              <div className="wa-actions"><span>Edit</span><span data-demo="approve" className={`is-main${phone.approved ? " is-done" : ""}`}>{phone.approved ? <><Check aria-hidden="true" />Approved</> : "Approve"}</span></div>
            </div>
          </>
        )}
        {phone.overlay && OverlayIcon && (
          <div className={`wa-overlay tone-${phone.overlay.tone}`} role="status" key={phone.overlay.title}>
            <span className="wa-overlay-icon"><OverlayIcon aria-hidden="true" /></span>
            <b>{phone.overlay.title}</b>
            {phone.overlay.detail && <p>{phone.overlay.detail}</p>}
            {phone.overlay.tone === "trouble" && (
              <div className="wa-clash">
                <p>Friday, 18 December</p>
                <ul>
                  <li><time>8:00 PM</time><span><strong>Company dinner</strong><small>Omar · Dubai Marina</small></span></li>
                  <li><time>8:00 PM</time><span><strong>Another booking</strong><small>Already confirmed</small></span></li>
                </ul>
                <em>Same date, same time</em>
              </div>
            )}
          </div>
        )}
        <DemoCursor cursor={cursor} />
      </div>
      <div className="phone-controls">
        {CHAPTERS.map((label, i) => <button type="button" key={label} className={i === phone.chapter ? "is-current" : ""} aria-current={i === phone.chapter ? "step" : undefined} onClick={() => jump(i)}>{t(label)}</button>)}
        <button type="button" className="phone-play" disabled={reduced} aria-label={t(paused ? "Play stories" : "Pause stories")} title={t(paused ? "Play stories" : "Pause stories")} onClick={() => setPaused((v) => !v)}>{paused || reduced ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>
        <button type="button" className="phone-play" aria-label={t("Replay")} title={t("Replay")} onClick={() => jump(0)}><RotateCcw aria-hidden="true" /></button>
      </div>
    </div>
  );
}

function Attachment({ card }: { card: Card }) {
  const Icon = CARD_ICONS[card.kind];
  return (
    <span className={`wa-card kind-${card.kind}`}>
      <span><Icon aria-hidden="true" /><span><b>{card.title}</b>{card.lines.map((line) => <small key={line}>{line}</small>)}</span></span>
      {card.action && <em>{card.action}</em>}
    </span>
  );
}
