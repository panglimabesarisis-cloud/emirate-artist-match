import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

const clientSteps = [
  ["You book and pay", "Deposit and balance are paid through Dealmaker, with itemised AED invoices and VAT receipts."],
  ["Dealmaker holds the money", "The artist sees the booking is funded, but the money stays with us. Nobody walks away with your deposit."],
  ["The show happens", "The artist performs as booked. If plans change before the day, the clear cancellation and refund policy applies."],
  ["The artist gets paid", "Only when the job is completed does Dealmaker release the payment to the artist. Fair for both sides."],
];
const artistSteps = [
  ["Register", "Pick a plan, from Free to Pro, and create your talent account in a minute. Our team reviews every profile before it goes live."],
  ["Fill in your rate card", "Set your starting price, set length and deposit once. Your AI manager quotes clients from these numbers, never below them."],
  ["Complete your profile", "Photos, videos, category, specialties and your stage identity. A complete profile ranks better and converts more enquiries."],
  ["Share your link everywhere", "Put your Dealmaker link in your Instagram bio, TikTok, WhatsApp status and Linktree. Every fan who wants to book you lands in one place."],
  ["Just wait for jobs", "No more handling hundreds of chats. Enquiries are answered for you, clients pay through Dealmaker, and you get a notification when a booking is confirmed."],
];
const roman = ["i", "ii", "iii", "iv", "v"];

export function HomeStory({ artists = false, profileSlug }: { artists?: boolean; profileSlug?: string }) {
  const { t } = useI18n();
  const steps = artists ? artistSteps : clientSteps;
  const idle = t(artists ? "Not on Dealmaker yet" : "Waiting for payment");
  const states = (artists ? ["Account created", "Rate card set", "Profile 100% complete", "Link shared on social", "New booking received"] : ["Paid by client", "Held by Dealmaker", "Event completed", "Released to artist"]).map(t);
  const link = profileSlug ? `https://dealmakertalent.com/artist/${profileSlug}` : "https://dealmakertalent.com/join";
  const copyLink = async () => { try { await navigator.clipboard.writeText(link); toast.success(t("Link copied")); } catch { toast.error(t("Could not copy the link.")); } };
  return <section className={`escrow story ${artists ? "alt" : ""}`} data-states={JSON.stringify(states)} data-idle={idle} aria-labelledby={artists ? "artist-story-title" : "client-story-title"}>
    <div className="wrap esc-in">
      <div className="esc-l">
        <p className="eyebrow">{t(artists ? "For artists · Get booked" : "For clients · Safe payment")}</p>
        <h2 className="serif" id={artists ? "artist-story-title" : "client-story-title"}>{artists ? <>{t("Set it up once.")} <em className="it">{t("Let the jobs come to you.")}</em></> : <>{t("Your money waits")} <em className="it">{t("with us,")}</em> {t("not with a stranger.")}</>}</h2>
        <p className="esc-p">{t(artists ? "Five steps, then you are done handling enquiries. Your AI manager talks to clients, Dealmaker handles the payment, you just show up and perform." : "Every payment goes through Dealmaker. We hold it while the event is ahead of you, and we only send it to the artist once the job is done.")}</p>
        <div className="vault">
          <div className="v-top"><span className="dot" /><span className="v-st">{idle}</span></div>
          {artists ? <div className="v-link"><span className="lk" dir="ltr">dealmakertalent.com/<b>{profileSlug ? `artist/${profileSlug}` : "join"}</b></span><Button type="button" variant="ghost" size="icon" className="copy" onClick={copyLink} aria-label={t("Copy link")} title={t("Copy link")}><Copy className="h-4 w-4" /></Button></div> : <div className="v-amt serif" dir="ltr">AED <span>4,500</span></div>}
          <div className="v-bar"><i /></div><div className="v-who">{(artists ? ["Sign up", "Profile", "Bookings"] : ["Client", "Dealmaker", "Artist"]).map((s) => <span key={s}>{t(s)}</span>)}</div>
        </div>
        <p className="esc-note">{t(artists ? "Your public profile link works on Instagram, TikTok, WhatsApp and anywhere else you post." : "Example booking. Live payments are switched off in this demo.")}</p>
      </div>
      <ol className="esc-steps"><li className="track" aria-hidden="true"><i /><span className="coin">{artists ? "★" : "AED"}</span></li>{steps.map(([title, description], i) => <li className="es" data-k={`${t("Step")} ${i + 1} ${t("of")} ${steps.length}`} key={title}><span className="es-n serif">{roman[i]}</span><div><h3>{t(title ?? "")}</h3><p>{t(description ?? "")}</p></div></li>)}</ol>
    </div>
  </section>;
}