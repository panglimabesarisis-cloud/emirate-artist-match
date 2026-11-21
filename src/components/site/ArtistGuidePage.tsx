import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, CalendarDays, FileText, Images, Link2, MessageSquare, SlidersHorizontal, Star, Users, Wallet, Workflow, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ReferenceTheme } from "@/components/shared/ReferenceTheme";
import { SceneBackground } from "@/components/shared/SceneBackground";
import { useI18n } from "@/lib/i18n";
import { PublicLayout } from "./PublicLayout";
import "./information.css";
import "./how-it-works.css";

type GuideSection = {
  title: string; accent: string; body: string; details: string[];
  evidence: { icon: LucideIcon; title: string; body: string }[];
};

const bookingSections: GuideSection[] = [
  { title: "Build your profile.", accent: "Get reviewed.", body: "Start with the talent registration journey: choose a plan, create your account, add your category and photos, set your rate card, complete your stage identity and review the contract. Your profile is reviewed before it goes live.",
    details: ["Show your specialties, skills and the locations where you perform", "Add photos, videos and portfolio work so clients can assess your style", "Set your packages and inclusions before enquiries arrive"],
    evidence: [{ icon: Images, title: "Your work", body: "Media and portfolio entries give clients something real to compare." }, { icon: SlidersHorizontal, title: "Your services", body: "Your rate card provides the prices and service details used in enquiries." }, { icon: BadgeCheck, title: "Profile approval", body: "Public visibility follows review. Verification documents have a separate review process." }] },
  { title: "Share your link.", accent: "Collect the brief.", body: "Once your approved profile is public, share its link with organisers or let clients discover you through category, specialty and location searches. Clients can request a quote or begin a conversation with your booking agent.",
    details: ["Keep your public profile link ready for enquiries", "Use saved forms and buttons to collect event details in chat", "Give your agent accurate knowledge, languages and reply preferences"],
    evidence: [{ icon: Link2, title: "One profile link", body: "Bring your work, packages and booking conversation into one destination." }, { icon: Workflow, title: "A structured enquiry", body: "Gather the date, venue, timings and job details through your saved flow." }, { icon: MessageSquare, title: "A human when needed", body: "You or an authorised team member can take over the conversation in Inbox." }] },
  { title: "Review the request.", accent: "Approve your offer.", body: "Your AI agent helps prepare the request, but it does not decide for you. Check the scope, availability and price, then approve or revise the offer before the client moves to payment.",
    details: ["Review the event hours, venue and performance requirements", "Use connected calendar availability when it can be verified", "Approve invoice items where the booking flow requires them"],
    evidence: [{ icon: CalendarDays, title: "Check the date", body: "A busy date blocks a draft. Unknown availability waits for your approval." }, { icon: FileText, title: "Check the scope", body: "Review the requested services and itemised offer, not just the starting rate." }, { icon: BadgeCheck, title: "Your decision", body: "Artist approval is a checkpoint, not proof that the client has accepted or paid." }] },
  { title: "Agree the details.", accent: "Track confirmation.", body: "The client reviews the approved offer, invoice and booking terms. Follow the deposit, remaining balance and booking status through the linked booking documents, rather than treating a chat message as payment confirmation.",
    details: ["Keep the agreed scope, invoice and contract together", "Follow separate deposit and balance stages", "Use booking status as the source of confirmation"],
    evidence: [{ icon: FileText, title: "Clear documents", body: "Booking amounts are in AED, with applicable 5% VAT shown on invoices." }, { icon: Wallet, title: "Verified status", body: "Payment status changes only after verified settlement, not a browser return or an AI claim." }, { icon: MessageSquare, title: "Configured notifications", body: "WhatsApp, email and calendar updates depend on connected services being configured." }] },
  { title: "Perform the event.", accent: "Build your record.", body: "Keep the agreed details close on the event day. After the booking is completed, your earnings and client feedback become part of the record you can follow in your workspace.",
    details: ["Review booking dates and documents in your dashboard", "Track completed-booking earnings separately from AI credits", "Choose which supported track-record statistics your profile displays"],
    evidence: [{ icon: CalendarDays, title: "Event details", body: "Use the booking and connected calendar to keep track of the agreed date." }, { icon: Star, title: "Booking-linked feedback", body: "Reviews relate to completed bookings, including performance, punctuality and communication." }, { icon: Wallet, title: "Earnings overview", body: "Your wallet reflects completed bookings, commission and payouts under the existing rules." }] },
];

const benefitSections: GuideSection[] = [
  { title: "Your work deserves", accent: "a proper profile.", body: "Give an organiser more than a name and a phone number. An approved Dealmaker profile brings your specialties, media, packages and work history into a place clients can browse and compare.",
    details: ["Appear in category, specialty and location discovery after approval", "Show photos, videos, portfolio entries and selected public clients", "Control supported profile statistics and submit verification documents"],
    evidence: [{ icon: Images, title: "Visible work", body: "Let your actual media and portfolio communicate your performance style." }, { icon: SlidersHorizontal, title: "Defined packages", body: "Publish the services, inclusions and pricing that guide your enquiries." }, { icon: Star, title: "A real track record", body: "Completed-booking reviews provide evidence without invented ratings or claims." }] },
  { title: "Let AI gather details.", accent: "Keep your attention.", body: "Your booking agent answers using your knowledge and rate card, and gathers event information through your flow. Routine questions can move forward while requests needing judgement come back to a person.",
    details: ["Arrange your enquiry steps with saved forms and buttons", "Set an allowed model, reply length and preferred languages", "Configure handover for negotiation, complaints and unclear requests"],
    evidence: [{ icon: Workflow, title: "Your conversation flow", body: "Build the steps yourself or use an available template within your plan limits." }, { icon: MessageSquare, title: "Your knowledge", body: "Give the agent the facts it needs without overriding pricing, privacy or safety rules." }, { icon: Wallet, title: "Your credit wallet", body: "AI replies use credits. Your balance is separate from booking earnings." }] },
  { title: "Your performance.", accent: "Your approval.", body: "Automation should help with the enquiry, not commit you to a job. You review the offer and can revise the details before the client is asked to proceed through the booking stages.",
    details: ["Keep artist review ahead of payment", "Take over conversations with your authorised team", "Use calendar checks without assuming unknown dates are available"],
    evidence: [{ icon: BadgeCheck, title: "Artist checkpoint", body: "An AI response does not replace your approval of the request." }, { icon: FileText, title: "An itemised agreement", body: "Invoices and contracts keep scope and totals separate from informal chat." }, { icon: CalendarDays, title: "Availability awareness", body: "Connect Google Calendar; unchecked availability still requires your decision." }] },
  { title: "Less scattered admin.", accent: "One working space.", body: "Keep client conversations, bookings, invoices and contracts in your artist workspace. Where your plan permits a team, invite members by email and assign their access while retaining protected owner controls.",
    details: ["Follow conversations and human handovers in Inbox", "Track booking documents, dates and payment status", "See earnings, payout requests and AI credits as separate records"],
    evidence: [{ icon: Users, title: "A controlled team", body: "Active invited members work through assigned roles; protected owner areas stay separate." }, { icon: FileText, title: "Connected documents", body: "Keep the approved offer and payment status attached to the booking." }, { icon: Wallet, title: "Clear balances", body: "Booking earnings do not become AI credits, and AI credits do not count as earnings." }] },
  { title: "Choose your tools.", accent: "Know the limits.", body: "Free, Basic, Medium and Pro offer different allowances for your profile and workspace. Compare the current packages during registration and choose the capacity that fits how you work, without a promise of guaranteed bookings.",
    details: ["Compare media, specialty, portfolio and team allowances", "Check available models, flow limits and AI credit allocation", "Review your plan commission and terms before joining"],
    evidence: [{ icon: SlidersHorizontal, title: "Plan-based capacity", body: "The selected plan determines limits and access to eligible tools and templates." }, { icon: BadgeCheck, title: "Honest expectations", body: "Joining does not guarantee enquiries, bookings or income." }, { icon: Wallet, title: "Sandbox today", body: "Payments are currently demo-only. No real money is charged." }] },
];

const bookingFaqs = [
  { question: "When does my profile become public?", answer: "After the team reviews and approves it. Completing registration does not immediately publish your profile, and verification badges follow their own document review." },
  { question: "Does the AI agent accept a job for me?", answer: "No. It gathers details and helps prepare the request. You review and approve or revise the offer before the client follows the approval and payment stages." },
  { question: "What if my calendar is not connected?", answer: "The enquiry can continue, but availability remains subject to your approval. A verified busy date blocks a draft; an unknown date is not treated as confirmed availability." },
  { question: "Can clients make real payments now?", answer: "No. Payments currently run in demo and sandbox mode. The booking flow shows AED invoice amounts, applicable VAT, deposit and balance stages without charging real money." },
];
const benefitFaqs = [
  { question: "Is Dealmaker a guarantee of paid jobs?", answer: "No. It provides a public profile, enquiry tools and an artist workspace. Bookings depend on client demand, fit, availability and the approval process." },
  { question: "Do I need to use the same AI flow as everyone else?", answer: "No. You can configure your own saved flow and knowledge, or use eligible templates within your plan. Pricing, privacy and safety rules still apply." },
  { question: "Can a manager help with enquiries?", answer: "Where your plan allows team members, invite them by email and assign a role. Active team members have authorised access, while owner-protected areas remain separate." },
  { question: "Are AI credits the same as my earnings?", answer: "No. Credits power AI replies. Your earnings wallet tracks booking money under completion, commission and payout rules. Payments are currently demo-only." },
];

export function ArtistGuidePage({ kind }: { kind: "booking" | "benefits" }) {
  const { t } = useI18n();
  const booking = kind === "booking";
  const sections = booking ? bookingSections : benefitSections;
  const faqs = booking ? bookingFaqs : benefitFaqs;
  return <ReferenceTheme><PublicLayout><div className="reference-features how-page">
    <section className="f-hero scenehost" data-scenes="arch">
      <SceneBackground />
      <div className="wrap f-hero-in">
        <span className="eyebrow">{t("For artists · Dealmaker")}</span>
        <h1 className="serif">{t(booking ? "How you get" : "Why artists")} <span className="it">{t(booking ? "booked." : "join.")}</span></h1>
        <p className="lead">{t(booking ? "From your first profile to a completed event: share your work, collect the brief and stay in control of every offer." : "A place for your work. An agent for your enquiries. A workspace for the details around every performance.")}</p>
        <div className="f-index">
          <Button asChild className="btn btn-gold"><Link to="/join">{t("Create a profile")}<ArrowRight aria-hidden="true" /></Link></Button>
          <Button asChild variant="outline" className="btn btn-line"><Link to={booking ? "/why-artists-join" : "/how-you-get-booked"}>{t(booking ? "Why artists join" : "How you get booked")}</Link></Button>
        </div>
      </div>
    </section>
    <div className="wrap">
      <section className="how-journey" aria-labelledby="artist-guide-title">
        <header className="how-intro"><div><span className="eyebrow">{t(booking ? "The booking journey" : "Your artist workspace")}</span><h2 id="artist-guide-title">{t(booking ? "From profile" : "More room to")} <span className="it">{t(booking ? "to performance." : "perform.")}</span></h2></div><p>{t(booking ? "Each stage has a clear purpose, and every offer has an artist checkpoint. An enquiry is the start, not a confirmed job." : "Bring your public presence and booking administration together without giving up the decisions that belong to you.")}</p></header>
        {sections.map((section, index) => <article key={section.title} className={`feat${index % 2 === 1 ? " flip" : ""}`}>
          <div className="ft-txt">{booking && <span className="ft-n serif" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>}<h3>{t(section.title)} <span className="it">{t(section.accent)}</span></h3><p>{t(section.body)}</p><ul>{section.details.map(detail => <li key={detail}>{t(detail)}</li>)}</ul></div>
          <aside className="how-diagram" aria-label={t(section.title)}><div className="how-diagram-title"><span>{t(booking ? "At this stage" : "What you can manage")}</span><ArrowRight aria-hidden="true" size={18} /></div><ol>{section.evidence.map(({ icon: Icon, title, body }) => <li className="how-milestone" key={title}><span className="how-milestone-icon"><Icon aria-hidden="true" /></span><div><strong>{t(title)}</strong><p>{t(body)}</p></div></li>)}</ol></aside>
        </article>)}
      </section>
      <section className="how-faq" aria-labelledby="artist-faq-title"><div><h2 id="artist-faq-title">{t(booking ? "Before your first" : "Before you")} <span className="it">{t(booking ? "booking." : "join.")}</span></h2><p>{t("Clear expectations about approval, plans and the tools in your workspace.")}</p></div><Accordion type="single" collapsible>{faqs.map(({ question, answer }) => <AccordionItem key={question} value={question}><AccordionTrigger className="how-faq-trigger">{t(question)}</AccordionTrigger><AccordionContent className="how-faq-answer">{t(answer)}</AccordionContent></AccordionItem>)}</Accordion></section>
      <section className="f-cta" aria-labelledby="artist-cta-title"><h2 id="artist-cta-title">{t("Put your talent")} <span className="it">{t("in the picture.")}</span></h2><div><Button asChild className="btn btn-gold"><Link to="/join">{t("Join as talent")}<ArrowRight aria-hidden="true" /></Link></Button><Button asChild variant="outline" className="btn btn-line"><Link to="/support">{t("Support")}</Link></Button></div></section>
    </div>
  </div></PublicLayout></ReferenceTheme>;
}