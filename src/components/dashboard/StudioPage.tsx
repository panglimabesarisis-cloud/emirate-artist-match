import type { ReactNode } from "react";
import { Clock3, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "./reference-pages.css";
import "./reference-adapters.css";

/** Presentation only: callers supply the existing data and controls. */
export function StudioHeading({ title, accent, children }: { title: string; accent: string; children?: ReactNode }) {
  const { t } = useI18n();
  const joined = ["Book", "Calen", "Invo", "Contr", "Wal", "Veri"].includes(title);
  const descriptions: Record<string, string> = {
    "Quote requests": "Every request sent from your public profile and order form.",
    "Bookings": "Offers you sent, requests waiting for your approval, and what each client still owes.",
    "Calendar": "Your bookings by date.",
    "Invoice": "Build an invoice, check it in the live preview, then send it straight into the client's chat.",
    "Contracts": "Every booking comes with a contract.",
    "Wallet": "What you earned from jobs booked through Dealmaker.",
    "Account settings": "Your payout bank account lives here. The Wallet page shows locked bank details read-only.",
    "Invite team": "Give a teammate their own login to answer inbox chats for you.",
    "AI credits": "Every AI reply costs one credit.",
    "Your profile": "This is what clients see before they book you.",
    "Rate card": "The jobs you offer, with a starting price and how long each one runs. Your AI agent quotes from this list.",
    "Order form": "The questions a client answers when they book you.",
    "Photos and videos": "Photos fill the slider on your profile and videos sit below it.",
    "Verification": "Verify who you are, and clients trust you faster. Your badges show on your public profile.",
    "AI agent": "Your assistant answers new enquiries for you.",
    "AI flow": "Draw how your assistant talks to a new client, step by step: what it asks, what it offers, and when it hands the chat to you.",
  };
  const description = descriptions[`${title}${joined ? "" : " "}${accent}`];
  return <header className="dmr-q-head dmr-c-12"><div><h1 className="dmr-serif">{t(title)}{!joined && " "}<span className="it">{t(accent)}</span></h1>{description && <p>{t(description)}</p>}</div>{children}</header>;
}

export function StudioSection({ title, accent, children, className = "" }: { title: string; accent?: string; children: ReactNode; className?: string }) {
  const { t } = useI18n();
  return <section className={`dmr-panel ${className}`}><div className="dmr-ph"><h2 className="dmr-serif">{t(title)} {accent && <span className="it">{t(accent)}</span>}</h2></div>{children}</section>;
}

export function StudioSoon({ label }: { label: string }) {
  const { t } = useI18n();
  return <div className="dmr-qe-f studio-soon-field"><Label>{t(label)} <span className="studio-soon"><Clock3 aria-hidden="true" />{t("segera")}</span></Label><Input disabled aria-label={t(label)} placeholder={t("segera")} /></div>;
}

export function StudioEmpty({ title, icon: Icon = Clock3 }: { title: string; icon?: LucideIcon }) {
  const { t } = useI18n();
  return <div className="dmr-q-empty"><span className="studio-empty-icon"><Icon aria-hidden="true" /></span><b className="dmr-serif">{t(title)}</b></div>;
}

export function StudioDonut({ title, entries }: { title: string; entries: { label: string; value: number }[] }) {
  const { t } = useI18n();
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  let offset = 0;
  return <section className="dmr-panel studio-donut-panel"><h2>{t(title)}</h2><div className="studio-donut-content"><div className="studio-donut"><svg viewBox="0 0 120 120" aria-label={t(title)} role="img"><circle className="studio-donut-track" cx="60" cy="60" r="48" />{entries.map((entry, i) => { const length = total ? entry.value / total * 301.59 : 0; const start = offset; offset += length; return <circle key={entry.label} className={`studio-donut-segment studio-donut-color-${i % 3}`} cx="60" cy="60" r="48" strokeDasharray={`${length} ${301.59 - length}`} strokeDashoffset={-start} />; })}</svg><strong>{total}</strong></div><dl>{entries.map((entry, i) => <div key={entry.label}><dt><i className={`studio-donut-key studio-donut-color-${i % 3}`} />{t(entry.label)}</dt><dd>{entry.value}</dd></div>)}</dl></div></section>;
}