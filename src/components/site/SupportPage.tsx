import { useState } from "react";
import { toast } from "sonner";
import { Search, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ReferenceTheme } from "@/components/shared/ReferenceTheme";
import { SceneBackground } from "@/components/shared/SceneBackground";
import { PublicLayout } from "./PublicLayout";
import "./information.css";

const faqs = [
 ["clients", "How do I book an artist?", "Find a performer, open their profile and send a free quick quote. Their AI manager replies with a price from their rate card. Once the artist approves, you pay the deposit and the booking is confirmed."],
 ["clients", "Can I cancel a booking?", "Yes. The cancellation and refund policy is shown before you confirm, and it decides what happens to any held payment."],
 ["clients", "Are the reviews real?", "Only clients with a completed booking can leave a review, so every rating comes from a real event."],
 ["artists", "How long does profile review take?", "With a paid subscription your profile is approved as soon as the payment is confirmed. On the Free plan our team checks it before it goes live."],
 ["artists", "Can I change my plan later?", "Manage your plan from your dashboard. Review the price and effective date before confirming any change."],
 ["artists", "What does the AI manager answer?", "Price questions, availability, what is included and simple follow-ups, using the prices and rules you set."],
 ["payments", "When does the artist get paid?", "Dealmaker holds the payment and releases it to the artist once the job is completed."],
 ["payments", "Which currency and taxes apply?", "Prices are shown in AED and 5% VAT applies where applicable. Booking invoices and receipts show the applicable totals."],
 ["payments", "Are payments live?", "Not yet. The platform is in demo mode, so no real money is charged."],
] as const;
export function SupportPage() {
 const [query, setQuery] = useState(""); const [group, setGroup] = useState(""); const [topic, setTopic] = useState("Booking");
 const found = faqs.filter(([g,q,a]) => (!group || g === group) && `${q} ${a}`.toLowerCase().includes(query.trim().toLowerCase()));
 return <ReferenceTheme><PublicLayout><section className="reference-scene-header support-header"><SceneBackground arch={false} /><div className="reference-wrap reference-scene-content"><span className="reference-eyebrow">Support</span><h1>How can we <em className="reference-gradient-text">help?</em></h1><div className="reference-search support-search"><div className="reference-search-text"><Search className="h-5 w-5" /><Input type="search" aria-label="Search help" placeholder="Search payments, bookings, profile…" value={query} onChange={e => setQuery(e.target.value)} /></div>{query && <span className="support-found">{found.length} found</span>}</div><div className="support-topics">{[["clients","For clients","Booking, quotes, cancellations"],["artists","For artists","Profile, plans, AI manager"],["payments","Payments","Wallet, deposits, payouts"]].map(([g,title,sub]) => <Button key={g} variant="outline" className={group === g ? "selected" : ""} aria-pressed={group === g} onClick={() => setGroup(current => current === g ? "" : g ?? "")}><b>{title}</b><span>{sub}</span></Button>)}</div></div></section>
 <div className="reference-wrap support-body"><section><h2>Common <em className="reference-gradient-text">questions</em></h2><Accordion type="single" collapsible>{found.map(([g,q,a]) => <AccordionItem key={q} value={q}><AccordionTrigger><span><small className="support-group">{g}</small>{q}</span></AccordionTrigger><AccordionContent>{a}</AccordionContent></AccordionItem>)}</Accordion>{!found.length && <p className="mt-8 text-muted-foreground">No answers match that.</p>}</section>
 <form className="support-form" onSubmit={e => { e.preventDefault(); e.currentTarget.reset(); setTopic("Booking"); toast.success("Demo message confirmed — no message was sent."); }}><h2>Still need help?</h2><p className="text-sm text-muted-foreground mt-3 mb-6">Demo contact form · messages are not sent.</p><div className="space-y-5"><div><Label htmlFor="support-name">Your name</Label><Input id="support-name" required autoComplete="name" /></div><div><Label htmlFor="support-email">Email</Label><Input id="support-email" type="email" required autoComplete="email" /></div><div><Label>Topic</Label><Select value={topic} onValueChange={setTopic}><SelectTrigger aria-label="Topic"><SelectValue /></SelectTrigger><SelectContent>{["Booking","Payments","My artist profile","Something else"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="support-message">How can we help?</Label><Textarea id="support-message" required rows={5} /></div><Button type="submit" className="reference-gold w-full">Send message<ArrowRight className="h-4 w-4" /></Button></div></form></div></PublicLayout></ReferenceTheme>;
}
