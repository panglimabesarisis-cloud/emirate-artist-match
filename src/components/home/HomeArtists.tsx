import { Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Check, Banknote, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { PhoneStories } from "./PhoneStories";
import { HideForArtist } from "@/components/shared/HideForArtist";
const notifications = [
  { icon: Bot, title: "AI manager replied", text: "6 enquiries answered with your rates", time: "now" },
  { icon: Check, title: "Booking confirmed", text: "Wedding · Palm Jumeirah", time: "2m" },
  { icon: ShieldCheck, title: "Deposit received", text: "Held safely by Dealmaker", time: "2m" },
  { icon: Banknote, title: "Payment released", text: "Job completed, money sent to you", time: "after the event" },
];
const perks = [
  ["No small talk", 'Price checks, "still available?" and endless back and forth are handled by your AI manager, day and night, in English and Arabic.'],
  ["No chasing payments", "The client pays through Dealmaker. You get a notification when the booking is funded and again when your money is released."],
  ["Just wait for orders", "Set your rate card and availability once. Confirmed jobs come to you, invoices and contracts are generated for you."],
];
export function HomeArtists() {
  const { t } = useI18n();
  return <section className="artists cream" aria-labelledby="home-artists-title"><div className="wrap">
    <div className="art-head"><p className="eyebrow">{t("For artists")}</p><h2 className="serif" id="home-artists-title">{t("Stop replying to chats")} <em className="it">{t("that never become jobs.")}</em></h2><p>{t('"How much?" "Still free Saturday?" "Can discount?" Then silence. Your AI manager answers every enquiry with your own prices and rules, so you only hear about bookings that are real.')}</p></div>
    <div className="duo"><PhoneStories />
      <div className="pane pane-b"><div className="pane-h"><span>{t("Your phone with Dealmaker")}</span><b className="live">{t("Automatic")}</b></div><ul className="notes" aria-label={t("Example of automatic booking notifications")}>{notifications.map(({ icon: Icon, title, text, time }) => <li key={title}><span className="ic" aria-hidden="true"><Icon className="h-5 w-5" /></span><div><b>{t(title)}</b><span>{t(text)}</span></div><time>{t(time)}</time></li>)}</ul></div></div>
    <ul className="perks">{perks.map(([title, text]) => <li className="rv" key={title}><span className="pk serif">{t(title ?? "")}</span><p>{t(text ?? "")}</p></li>)}</ul>
    <div className="art-cta rv"><HideForArtist><Button asChild className="btn btn-dark"><Link to="/join">{t("Create your profile")}<ArrowRight className="arr h-4 w-4" /></Link></Button></HideForArtist><span>{t("Free plan available. Our team reviews every profile.")}</span></div>
  </div></section>;
}