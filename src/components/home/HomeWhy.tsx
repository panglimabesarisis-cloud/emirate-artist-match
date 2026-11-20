import { CalendarCheck, ShieldCheck, Star } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const benefits = [
  { title: "Effortless booking", description: "Find your performer, check their schedule and keep every booking detail in one place.", points: ["Google Calendar availability checks", "Itemised invoices in AED", "All bookings tracked in one dashboard"] },
  { title: "Clear, trackable payments", description: "Review your contract and invoice before paying your deposit, with your balance always visible.", points: ["Deposit and balance payment tracking", "VAT invoices & receipts", "Clear cancellation & refund policy"] },
  { title: "Served by AI, 24/7", description: "Every artist has an AI manager that answers enquiries using their own prices and rules.", points: ["Enquiries any time of day", "English & Arabic", "Artist approval before your invoice"] },
];
export function HomeWhy() {
  const { t } = useI18n();
  return <section className="wrap sec" aria-labelledby="home-why-title"><div className="sh"><div><p className="eyebrow rv">{t("Why Dealmaker")}</p><h2 className="serif rv" id="home-why-title"><span className="line"><span>{t("Booking talent,")}</span></span><span className="line"><span><em className="it">{t("finally simple.")}</em></span></span></h2></div><p className="rv d2">{t("From first enquiry to final invoice, everything in one place.")}</p></div>
    <div className="why-grid">{benefits.map((b, i) => <article className="why rv" key={b.title}><div className="num">0{i + 1}</div><h3>{t(b.title)}</h3><p>{t(b.description)}</p><ul>{b.points.map((p) => <li key={p}>{t(p)}</li>)}</ul></article>)}</div>
    <div className="steps3">{["Choose", "Quote", "Confirm"].map((s, i) => <div className="rv" key={s}><b>{i + 1}</b><span className={i === 2 ? "it" : ""}>{t(s)}</span></div>)}</div>
    <div className="trust rv"><span><ShieldCheck className="h-4 w-4" />{t("Verified talent")}</span><span><Star className="h-4 w-4" />{t("Reviews only from completed bookings")}</span><span><CalendarCheck className="h-4 w-4" />{t("Clear cancellation & refund policy")}</span></div>
  </section>;
}