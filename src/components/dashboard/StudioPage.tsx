import type { ReactNode } from "react";
import { Clock3, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "./reference-pages.css";
import "./reference-adapters.css";

/** Presentation only: callers supply the existing data and controls. */
export function StudioHeading({ title, accent, children }: { title: string; accent: string; children?: ReactNode }) {
  const { t, lang } = useI18n();
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
    "AI credits": "Your final AI task charges and remaining credits.",
    "Your profile": "This is what clients see before they book you. A complete profile with a real bio, photo and past work gets more quote requests.",
    "Rate card": "The jobs you offer, with a starting price and how long each one runs. Your AI agent quotes from this list.",
    "Order form": "The questions a client answers when they book you.",
    "Photos and videos": "Photos fill the slider on your profile and videos sit below it.",
    "Verification": "Verify who you are, and clients trust you faster. Your badges show on your public profile.",
    "AI agent": "Your assistant answers new enquiries for you. Choose how it talks, teach it your rules and facts, and test it before clients ever see it.",
    "AI flow": "Draw how your assistant talks to a new client, step by step: what it asks, what it offers, and when it hands the chat to you.",
  };
  const description = descriptions[`${title}${joined ? "" : " "}${accent}`];
  const fullTitle = `${title}${joined ? "" : " "}${accent}`;
  return <header className="dmr-q-head dmr-c-12"><div><h1 className="dmr-serif">{lang === "ar" ? t(fullTitle) : <>{t(title)}{!joined && " "}<span className="it">{t(accent)}</span></>}</h1>{description && <p>{t(description)}</p>}</div>{children}</header>;
}

export function StudioSection({ title, accent, subtitle, aside, children, className = "", id }: { title: string; accent?: string; subtitle?: string; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  const { t } = useI18n();
  return <section id={id} className={`dmr-panel ${className}`}><div className="dmr-ph" style={aside ? { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 } : undefined}><div><h2 className="dmr-serif">{t(title)} {accent && <span className="it">{t(accent)}</span>}</h2>{subtitle && <p className="mt-1 text-xs text-muted-foreground">{t(subtitle)}</p>}</div>{aside}</div>{children}</section>;
}

export function StudioSoon({ label }: { label: string }) {
  const { t } = useI18n();
  return <div className="dmr-qe-f studio-soon-field"><Label>{t(label)} <span className="studio-soon"><Clock3 aria-hidden="true" />{t("segera")}</span></Label><Input disabled aria-label={t(label)} placeholder={t("segera")} /></div>;
}

export function StudioEmpty({ title, icon: Icon = Clock3 }: { title: string; icon?: LucideIcon }) {
  const { t } = useI18n();
  return <div className="dmr-q-empty"><span className="studio-empty-icon"><Icon aria-hidden="true" /></span><b className="dmr-serif">{t(title)}</b></div>;
}

const DONUT_COLORS: Record<string, string> = {
  Done: "#7bd88f", Waiting: "#e8b04a", Unpaid: "#e2574c", Partial: "rgba(232,176,74,.55)", Paid: "#f0c062", Collected: "#7bd88f", Due: "#e2574c", "Balance due": "#e2574c",
};
const DONUT_FALLBACK = ["#e8b04a", "#7bd88f", "#e2574c", "#f0c062"];

/** Ring chart with a total in the middle and a legend, as in the design reference. */
export function StudioDonut({ title, subtitle, entries, center, unit, format }: {
  title: string; subtitle?: string; entries: { label: string; value: number; color?: string }[]; center?: string | number; unit?: string; format?: (n: number) => string;
}) {
  const { t } = useI18n();
  const total = entries.reduce((sum, e) => sum + e.value, 0);
  const R = 54, C = 2 * Math.PI * R;
  const live = entries.filter((e) => e.value > 0);
  const gap = live.length > 1 ? 2 : 0;
  let off = 0;
  const [first, ...rest] = title.split(" ");
  const fmt = format ?? ((n: number) => String(n));
  return (
    <section className="dmr-panel studio-donut-panel">
      <div className="mb-1.5">
        <h2 className="dmr-serif">{first} {rest.length > 0 && <span className="it">{rest.join(" ")}</span>}</h2>
        {subtitle && <small className="block text-xs font-normal text-muted-foreground">{t(subtitle)}</small>}
      </div>
      <div className="flex flex-wrap items-center gap-7">
        <svg viewBox="0 0 140 140" className="h-[170px] w-[170px] shrink-0" role="img" aria-label={`${title}: ${entries.map((e) => `${t(e.label)} ${fmt(e.value)}`).join(", ")}`}>
          <circle r={R} cx="70" cy="70" fill="none" stroke="rgba(246,239,226,.07)" strokeWidth="16" />
          {total > 0 && entries.map((e, i) => {
            if (e.value <= 0) return null;
            const len = (C * e.value) / total;
            const start = off; off += len;
            return <circle key={e.label} r={R} cx="70" cy="70" fill="none" stroke={e.color ?? DONUT_COLORS[e.label] ?? DONUT_FALLBACK[i % DONUT_FALLBACK.length]} strokeWidth="16" strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-start} transform="rotate(-90 70 70)"><title>{`${t(e.label)}: ${fmt(e.value)}`}</title></circle>;
          })}
          <text x="70" y="68" textAnchor="middle" style={{ fill: "var(--foreground)", fontFamily: "var(--font-display)", fontSize: 34 }}>{center ?? total}</text>
          {unit && <text x="70" y="88" textAnchor="middle" style={{ fill: "var(--muted-foreground)", fontSize: 10, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase" }}>{t(unit)}</text>}
        </svg>
        <ul className="flex min-w-[180px] flex-1 flex-col gap-2">
          {entries.map((e, i) => (
            <li key={e.label} className="grid grid-cols-[12px_1fr_auto_44px] items-center gap-2.5 rounded-xl border border-border bg-foreground/[.02] px-3 py-2.5 text-[13.5px]">
              <i className="h-3 w-3 rounded" style={{ background: e.color ?? DONUT_COLORS[e.label] ?? DONUT_FALLBACK[i % DONUT_FALLBACK.length] }} aria-hidden />
              <span>{t(e.label)}</span>
              <b className="whitespace-nowrap font-display text-[22px] font-normal" dir="ltr">{fmt(e.value)}</b>
              <em className="text-end text-xs not-italic text-muted-foreground">{total ? Math.round((e.value / total) * 100) : 0}%</em>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
