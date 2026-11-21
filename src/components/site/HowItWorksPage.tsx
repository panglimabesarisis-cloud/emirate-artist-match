import { Link } from "@tanstack/react-router";
import { ArrowRight, Search, MapPin, Images, MessageSquare, CalendarDays, BadgeCheck, FileText, CreditCard, Star, UserRound, BriefcaseBusiness, SlidersHorizontal, Workflow, BookOpen, Users, Wallet, LockKeyhole, Check, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ReferenceTheme } from "@/components/shared/ReferenceTheme";
import { SceneBackground } from "@/components/shared/SceneBackground";
import { PublicLayout } from "./PublicLayout";
import "./information.css";
import "./how-it-works.css";

type Milestone = { icon: LucideIcon; title: string; body: string };
type JourneyStep = {
  number: string;
  title: string;
  accent: string;
  body: string;
  details: string[];
  diagramTitle: string;
  milestones: Milestone[];
  note: string;
};

const clientSteps: JourneyStep[] = [
  {
    number: "01", title: "Find the right", accent: "performer.",
    body: "Start with your event, not a long list of contacts. Browse talent across the UAE, narrow down the options and open the profiles that fit your occasion.",
    details: ["Filter by category, specialty, emirate and area", "Compare photos, videos and available packages", "Read completed-booking reviews and the badges shown on each profile"],
    diagramTitle: "Discovery", milestones: [
      { icon: Search, title: "Choose a specialty", body: "Find musicians, performers and other talent for your event." },
      { icon: MapPin, title: "Set the location", body: "Look for talent in the emirate and area where you need them." },
      { icon: Images, title: "Explore their work", body: "Get a feel for the artist before starting a conversation." },
    ], note: "No payment is needed to browse or request a quote.",
  },
  {
    number: "02", title: "Share your brief.", accent: "Get a quote.",
    body: "Send a free quick quote or open the artist’s booking chat. Their AI agent gathers the event details, answers questions using the artist’s information and helps turn your enquiry into a booking request.",
    details: ["Share the event date, venue, timing and job details", "Answer the artist’s forms and choices directly in chat", "The artist reviews the request and approves or revises the offer"],
    diagramTitle: "Enquiry to approval", milestones: [
      { icon: MessageSquare, title: "Your event brief", body: "Describe what you need and keep the discussion in one conversation." },
      { icon: CalendarDays, title: "Availability and pricing", body: "The agent uses the artist’s rate card and connected calendar when available." },
      { icon: BadgeCheck, title: "Artist approval", body: "The artist has the final say on the offer before payment." },
    ], note: "If availability cannot be verified, the request waits for artist approval.",
  },
  {
    number: "03", title: "Confirm the details.", accent: "Enjoy the event.",
    body: "Review the agreed offer, invoice and booking terms before confirming. Keep the deposit, remaining balance and booking status together, then leave a review when the booking is completed.",
    details: ["Review invoice items, applicable VAT and cancellation terms", "Follow deposit and balance status on the booking link", "Rate performance, punctuality and communication after completion"],
    diagramTitle: "Booking to review", milestones: [
      { icon: FileText, title: "A clear agreement", body: "Check the approved scope, totals and any contract attached to the booking." },
      { icon: CreditCard, title: "Deposit and balance", body: "Use the booking checkout to follow the payment stages in sandbox mode." },
      { icon: Star, title: "A completed-booking review", body: "Share feedback tied to the event you actually booked." },
    ], note: "Payments are currently demo-only. No real money is charged.",
  },
];

const artistSteps: JourneyStep[] = [
  {
    number: "04", title: "Build a profile", accent: "worth booking.",
    body: "Join as talent, choose a plan and bring your work into one profile. Add your specialties, media, portfolio and packages, then submit your profile for approval before it appears publicly.",
    details: ["Show your skills, portfolio and the past clients you choose to make public", "Set package prices and the information in your rate card", "Submit verification documents and control which track-record stats are visible"],
    diagramTitle: "Your public presence", milestones: [
      { icon: UserRound, title: "Profile and specialties", body: "Tell clients who you are, what you do and where you perform." },
      { icon: BriefcaseBusiness, title: "Work and packages", body: "Add photos, videos and portfolio entries alongside your services." },
      { icon: BadgeCheck, title: "Review and visibility", body: "Your profile goes public after approval. Verification badges follow their own review." },
    ], note: "Media, specialties and other workspace limits follow your selected plan.",
  },
  {
    number: "05", title: "Brief your", accent: "AI booking agent.",
    body: "Give your agent the same guidance you would give a manager. Set its tone, languages and knowledge, then arrange your enquiry flow with forms, buttons and booking steps that match how you work.",
    details: ["Build a flow or start from an available template", "Collect client and event details with saved forms and choices", "Set handover preferences for negotiations, complaints and unclear requests"],
    diagramTitle: "Your rules, your flow", milestones: [
      { icon: BookOpen, title: "Knowledge and rate card", body: "Supply the facts, inclusions and prices the agent should use." },
      { icon: Workflow, title: "A structured conversation", body: "Arrange the questions and steps leading to an artist-reviewed request." },
      { icon: SlidersHorizontal, title: "Response preferences", body: "Choose an allowed model, reply length and languages in your agent settings." },
    ], note: "Your agent’s preferences never override pricing, privacy or safety rules.",
  },
  {
    number: "06", title: "Manage the booking.", accent: "Keep performing.",
    body: "Use your workspace to follow enquiries, approve offers and keep booking documents together. Connect your calendar, invite a team where your plan allows it and track earnings separately from the credits your AI uses.",
    details: ["Take over conversations in Inbox and manage invoices and contracts", "Give invited team members access through assigned roles", "Track held and completed-booking earnings, payouts and AI credit usage"],
    diagramTitle: "Your working day", milestones: [
      { icon: Users, title: "Inbox and team", body: "Keep client conversations together while the owner retains protected account access." },
      { icon: CalendarDays, title: "Dates and follow-ups", body: "Connect Google Calendar and use configured booking notifications and reminders." },
      { icon: Wallet, title: "Two separate balances", body: "Your earnings wallet tracks booking money. Your AI credit wallet powers replies." },
    ], note: "WhatsApp, email and calendar delivery depend on the connected services being configured.",
  },
];

const faqs = [
  { question: "Does an AI reply confirm my booking?", answer: "No. A conversation or quote is not a confirmed booking. The artist reviews the request, and the booking follows its approval and payment stages. If a date cannot be checked, it remains subject to artist approval." },
  { question: "Can I speak with the artist or their team?", answer: "Yes. Artists and authorised team members can take over conversations in Inbox. The AI agent can handle routine questions while requests needing a person are handed over according to the artist’s settings." },
  { question: "Are payments live?", answer: "No. Dealmaker currently uses demo and sandbox payments, with no real money charged. Booking amounts are presented in AED and invoices show the applicable 5% VAT and agreed payment stages." },
  { question: "What happens if I need to cancel?", answer: "Review the cancellation and refund terms shown for your booking before confirming. Refund eligibility depends on those terms and the booking’s current status, not on an AI message promising a refund." },
  { question: "How do plans and AI credits work?", answer: "Your plan sets the available models and limits for media, specialties, team members and other tools. AI replies use credits from a separate credit wallet. Your dashboard shows your plan and credits, independently of booking earnings." },
  { question: "Can I use Dealmaker in Arabic?", answer: "Dealmaker supports English and Arabic, including right-to-left layouts. Artists can also set their agent’s preferred languages. Some inner workspace forms remain in English." },
];

function Step({ step, flip }: { step: JourneyStep; flip: boolean }) {
  return <article className={`feat${flip ? " flip" : ""}`}>
    <div className="ft-txt">
      <span className="ft-n serif" aria-hidden="true">{step.number}</span>
      <h3>{step.title} <span className="it">{step.accent}</span></h3>
      <p>{step.body}</p>
      <ul>{step.details.map(detail => <li key={detail}>{detail}</li>)}</ul>
    </div>
    <aside className="how-diagram" aria-label={step.diagramTitle}>
      <div className="how-diagram-title"><span>{step.diagramTitle}</span><ArrowRight size={18} aria-hidden="true" /></div>
      <ol>{step.milestones.map(({ icon: Icon, title, body }) => <li className="how-milestone" key={title}>
        <span className="how-milestone-icon"><Icon aria-hidden="true" /></span>
        <div><strong>{title}</strong><p>{body}</p></div>
      </li>)}</ol>
      <p className="how-caption"><Check aria-hidden="true" /><span>{step.note}</span></p>
    </aside>
  </article>;
}

export function HowItWorksPage() {
  return <ReferenceTheme><PublicLayout><div className="reference-features how-page">
    <section className="f-hero scenehost" data-scenes="arch">
      <SceneBackground />
      <div className="wrap f-hero-in">
        <span className="eyebrow">How it works</span>
        <h1 className="serif">From first enquiry <span className="it">to final encore.</span></h1>
        <p className="lead">Find the right talent. Agree the details. Keep the booking in one place. Here’s how clients and artists come together on Dealmaker.</p>
        <nav aria-label="Booking journeys"><ul className="f-index">
          <li><Button variant="outline" asChild><a href="#for-clients"><Search aria-hidden="true" />For clients</a></Button></li>
          <li><Button variant="outline" asChild><a href="#for-artists"><UserRound aria-hidden="true" />For artists</a></Button></li>
          <li><Button variant="outline" asChild><a href="#booking-questions"><MessageSquare aria-hidden="true" />Common questions</a></Button></li>
        </ul></nav>
      </div>
    </section>
    <div className="wrap">
      <section className="how-journey" id="for-clients" aria-labelledby="client-journey-title">
        <header className="how-intro"><div><span className="eyebrow">For clients</span><h2 id="client-journey-title">Your event starts <span className="it">here.</span></h2></div><p>From discovering a performer to reviewing the finished event, each stage keeps you close to the details that matter.</p></header>
        {clientSteps.map((step, index) => <Step key={step.number} step={step} flip={index % 2 === 1} />)}
      </section>
      <section className="how-journey" id="for-artists" aria-labelledby="artist-journey-title">
        <header className="how-intro"><div><span className="eyebrow">For artists</span><h2 id="artist-journey-title">Your talent. <span className="it">Your terms.</span></h2></div><p>Show your work, shape your agent and stay in control of every offer. The workspace handles the details around your performance.</p></header>
        {artistSteps.map((step, index) => <Step key={step.number} step={step} flip={index % 2 === 0} />)}
      </section>
      <section className="how-faq" id="booking-questions" aria-labelledby="how-faq-title">
        <div><h2 id="how-faq-title">Before you <span className="it">get started.</span></h2><p>A few details about approvals, payments and the way your workspace operates.</p></div>
        <Accordion type="single" collapsible>{faqs.map(({ question, answer }) => <AccordionItem key={question} value={question}><AccordionTrigger className="how-faq-trigger">{question}</AccordionTrigger><AccordionContent className="how-faq-answer">{answer}</AccordionContent></AccordionItem>)}</Accordion>
      </section>
      <section className="f-cta" aria-labelledby="how-cta-title"><h2 id="how-cta-title">Make your next event <span className="it">happen.</span></h2><div>
        <Button asChild className="btn btn-gold"><Link to="/$category" params={{ category: "musicians" }}>Find talent<ArrowRight aria-hidden="true" /></Link></Button>
        <Button asChild variant="outline" className="btn btn-line"><Link to="/join">Join as talent<UserRound aria-hidden="true" /></Link></Button>
        <Button asChild variant="ghost" className="btn btn-line"><Link to="/support"><LockKeyhole aria-hidden="true" />Booking support</Link></Button>
      </div></section>
    </div>
  </div></PublicLayout></ReferenceTheme>;
}