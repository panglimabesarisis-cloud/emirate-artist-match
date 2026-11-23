import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, CalendarDays, Check, CreditCard, FileText, Images, MapPin, MessageSquare, Music2, ShieldCheck, Sparkles, Star, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import "./information.css";
import "./how-it-works.css";
import "./for-clients.css";
import "./booking-guide.css";

type ClientSection = {
  number: string; title: string; accent: string; body: string; details: string[];
  diagram: string; milestones: { icon: LucideIcon; title: string; body: string }[]; note: string;
};

const sections: ClientSection[] = [
  {
    number: "01", title: "See the talent.", accent: "Find your match.",
    body: "A wedding singer, a DJ for the evening or a cultural act for your guests. Explore talent across the UAE and compare the work, services and details that make a performer right for your event.",
    details: ["Narrow the search by category, specialty, emirate and area", "Explore profile photos, videos and available packages", "Check the reviews and verification badges each artist has earned"],
    diagram: "What to compare", milestones: [
      { icon: Music2, title: "Specialty and style", body: "Match the performance to the atmosphere you want to create." },
      { icon: Images, title: "Work you can see", body: "Look through the artist’s media and portfolio where available." },
      { icon: MapPin, title: "Location and package", body: "Check where the artist works and what their listed services include." },
    ], note: "Browse profiles and request a quick quote for free.",
  },
  {
    number: "02", title: "Your brief.", accent: "Their expertise.",
    body: "Start a conversation from the artist’s profile. Their AI booking agent helps collect your event requirements and answers routine questions from the artist’s own rate card and knowledge. The artist reviews the offer before you pay.",
    details: ["Share the date, venue, timing, duration and performance requirements", "Use the forms, choices and attachments available in booking chat", "Keep questions, offer revisions and artist approval in one conversation"],
    diagram: "From enquiry to offer", milestones: [
      { icon: MessageSquare, title: "Tell us about the event", body: "The artist’s booking flow gathers the details needed for an informed offer." },
      { icon: CalendarDays, title: "Check the fit", body: "Availability is checked against the connected calendar when available." },
      { icon: BadgeCheck, title: "Let the artist confirm", body: "The artist approves or revises the proposed booking before checkout." },
    ], note: "An AI reply is not a booking confirmation. Unverified dates wait for artist approval.",
  },
  {
    number: "03", title: "Clear details.", accent: "One booking link.",
    body: "Review the approved scope, invoice and any booking contract before committing. Your booking link brings together the agreed details, payment stages and status so you can return to them as the event approaches.",
    details: ["See itemised AED amounts, applicable 5% VAT and payment terms", "Follow deposit and remaining balance status", "Leave performance, punctuality and communication feedback after completion"],
    diagram: "Your event record", milestones: [
      { icon: FileText, title: "Offer and documents", body: "Review inclusions, event details and the cancellation terms for your booking." },
      { icon: CreditCard, title: "Payment stages", body: "Follow the deposit and balance through the existing demo checkout." },
      { icon: Star, title: "Feedback after the event", body: "Completed-booking reviews help the next client make a better choice." },
    ], note: "Payments are currently demo-only. No real money is charged.",
  },
];

const questions = [
  { title: "Do I need to pay to request a quote?", body: "No. Browsing talent and sending a quick quote request are free. Review the artist-approved offer and its terms before proceeding to the booking’s payment stage." },
  { title: "Is the profile’s starting price my final quote?", body: "Not necessarily. A starting price or listed package is a guide to the artist’s services. The approved offer reflects your event requirements, inclusions and any agreed changes. Review the invoice total before confirming." },
  { title: "What if the artist’s calendar is not connected?", body: "Your enquiry can still be discussed, but availability cannot be treated as verified. The request waits for the artist’s approval rather than automatically confirming the date." },
  { title: "Can a person take over the booking chat?", body: "Yes. The artist or an authorised team member can take over the conversation in their Inbox. Routine questions can stay with the AI agent while the artist handles the decisions requiring their approval." },
  { title: "How are cancellations and refunds handled?", body: "The cancellation and refund terms shown for your booking determine what applies. Review them before confirming, and keep the booking link for reference if your plans change. Refunds are not guaranteed by an AI response." },
  { title: "Are payments and notifications live?", body: "Payments currently run in demo and sandbox mode, with no real money charged. Email, WhatsApp and calendar notifications depend on the artist’s connected services being configured; keep your booking link as the reference for your booking status." },
];

function BookingQuestionsChat() {
  const { t } = useI18n();
  const [selected, setSelected] = useState(0);
  const question = questions[selected] ?? questions[0];
  if (!question) return null;
  return <div className="booking-questions-chat">
    <header className="booking-chat-header"><Sparkles aria-hidden="true" /><div><strong>Dealmaker</strong><span>{t("Booking questions")}</span></div><MessageSquare aria-hidden="true" /></header>
    <div className="booking-chat-thread" aria-live="polite" aria-atomic="true">
      <div key={question.title} className="booking-chat-exchange">
        <div className="booking-chat-question"><span>{t("You")}</span><p>{t(question.title)}</p></div>
        <div className="booking-chat-answer"><span><Sparkles size={14} aria-hidden="true" />Dealmaker</span><p>{t(question.body)}</p></div>
      </div>
    </div>
    <div className="booking-chat-prompts" aria-label={t("Booking questions")}>
      {questions.map((item, index) => <Button key={item.title} variant="outline" aria-pressed={selected === index} onClick={() => setSelected(index)}><span>{t(item.title)}</span><ArrowRight size={14} aria-hidden="true" /></Button>)}
    </div>
  </div>;
}

export function ClientBookingGuide() {
  const id = useId();
  return <div className="how-page clients-page client-booking-guide">
      <section className="how-journey" aria-labelledby={`${id}-client-booking-title`}>
        <header className="how-intro"><div><span className="eyebrow">Booking with Dealmaker</span><h2 id={`${id}-client-booking-title`}>Less chasing. <span className="it">More celebrating.</span></h2></div><p>Choose with context, discuss the requirements and review a clear agreement. You stay involved in the decisions that shape your event.</p></header>
        {sections.map((section, index) => <article className={`feat${index % 2 === 1 ? " flip" : ""}`} key={section.number}>
          <div className="ft-txt"><span className="ft-n serif" aria-hidden="true">{section.number}</span><h3>{section.title} <span className="it">{section.accent}</span></h3><p>{section.body}</p><ul>{section.details.map(detail => <li key={detail}>{detail}</li>)}</ul></div>
          <aside className="how-diagram" aria-label={section.diagram}>
            <div className="how-diagram-title"><span>{section.diagram}</span><ArrowRight size={18} aria-hidden="true" /></div>
            <ol>{section.milestones.map(({ icon: Icon, title, body }) => <li className="how-milestone" key={title}><span className="how-milestone-icon"><Icon aria-hidden="true" /></span><div><strong>{title}</strong><p>{body}</p></div></li>)}</ol>
            <p className="how-caption"><Check aria-hidden="true" /><span>{section.note}</span></p>
          </aside>
        </article>)}
      </section>
      <section className="client-trust" aria-labelledby={`${id}-client-trust-title`}>
        <h2 id={`${id}-client-trust-title`}>Confidence comes <span className="it">from the details.</span></h2>
        <ul className="client-trust-list">
          <li><BadgeCheck aria-hidden="true" /><h3>Profile evidence, not guesswork</h3><p>Public artists go through profile approval. Check the badges actually displayed and explore their work before choosing.</p></li>
          <li><Star aria-hidden="true" /><h3>Reviews tied to completed bookings</h3><p>Client feedback comes from completed events, with separate ratings for performance, punctuality and communication.</p></li>
          <li><ShieldCheck aria-hidden="true" /><h3>An offer the artist has reviewed</h3><p>Your event requirements go to the artist for approval. Read the agreed scope and terms rather than relying on a chat estimate.</p></li>
        </ul>
      </section>
      <section className="how-faq" aria-labelledby={`${id}-client-questions-title`}>
        <div><h2 id={`${id}-client-questions-title`}>Good questions. <span className="it">Clear answers.</span></h2><p>What to know before you request a quote or confirm an event.</p><Link className="client-support-link" to="/support">More booking support<ArrowRight size={16} aria-hidden="true" /></Link></div>
        <BookingQuestionsChat />
      </section>
  </div>;
}
