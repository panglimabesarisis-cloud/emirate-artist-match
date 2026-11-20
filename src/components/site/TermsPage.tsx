import { ReferenceTheme } from "@/components/shared/ReferenceTheme";
import { PublicLayout } from "./PublicLayout";
import "./information.css";
export function TermsPage() { return <ReferenceTheme><PublicLayout><div className="wrap legal">
<aside className="lg-side"><div className="eyebrow">Legal</div><h1 className="serif">Terms of <span className="it">Service</span></h1>
<p className="lg-meta">Draft for the demo platform. Have it reviewed by a UAE-qualified lawyer before launch.</p>
<nav aria-label="Sections" className="lg-toc" id="lg-toc"><a href="#terms-1">1. About Dealmaker</a><a href="#terms-2">2. Accounts</a><a href="#terms-3">3. Enquiries and quotes</a><a href="#terms-4">4. Payments and safe payment</a><a href="#terms-5">5. Platform commission</a><a href="#terms-6">6. Cancellations and refunds</a><a href="#terms-7">7. Reviews</a><a href="#terms-8">8. Conduct and content</a><a href="#terms-9">9. Changes to these terms</a></nav></aside>
<div className="lg-body" id="lg-body">
<section id="terms-1"><h2>1. About Dealmaker</h2><p>Dealmaker is a marketplace that connects event organisers ("clients") with performers and entertainers ("artists") in the United Arab Emirates. Each artist has an AI manager that answers enquiries on their behalf. The platform is currently in demo mode and does not process real payments.</p></section>
<section id="terms-2"><h2>2. Accounts</h2><p>You must give accurate information when you create an account and keep your login details private. Artist profiles are reviewed by the Dealmaker team before they go live, and we may decline or remove a profile that is incomplete, misleading or breaks these terms.</p></section>
<section id="terms-3"><h2>3. Enquiries and quotes</h2><p>An artist's AI manager replies to enquiries using the prices, availability and rules the artist has set. A quote becomes a booking only after the artist approves it and the client pays the required deposit.</p></section>
<section id="terms-4"><h2>4. Payments and safe payment</h2><p>Clients pay through Dealmaker. Payments are held by Dealmaker and released to the artist only after the job is completed. Prices are shown in AED and include 5% VAT where applicable. Invoices and receipts are issued for each booking.</p></section>
<section id="terms-5"><h2>5. Platform commission</h2><p>Dealmaker charges a platform commission based on the artist’s applicable plan. The rate is fixed when the quote is approved. Subscription prices, billing periods and any changes are shown in the artist dashboard before confirmation.</p></section>
<section id="terms-6"><h2>6. Cancellations and refunds</h2><p>Cancellations and refunds follow the cancellation and refund policy shown to both sides before the booking is confirmed. If an event does not take place as booked, held funds are handled under that policy.</p></section>
<section id="terms-7"><h2>7. Reviews</h2><p>Only clients with a completed booking can leave a review. Reviews must be honest and about the booking itself. We may remove reviews that are abusive, unrelated or false.</p></section>
<section id="terms-8"><h2>8. Conduct and content</h2><p>Do not use Dealmaker to arrange bookings outside the platform, harass other users, or upload content you do not have the right to use. Artists remain responsible for the accuracy of their profile, documents and performance.</p></section>
<section id="terms-9"><h2>9. Changes to these terms</h2><p>We may update these terms as the platform develops. When we make material changes we will notify you in the app or by email before they take effect.</p></section>
</div>
</div></PublicLayout></ReferenceTheme>; }
