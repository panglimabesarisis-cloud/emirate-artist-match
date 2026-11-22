import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { initials } from "@/lib/format";
import type { Tone } from "@/lib/client-portal-rules";
import { useI18n } from "@/lib/i18n";

export const money = (n: number | string | null | undefined) =>
  `AED ${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const moneyShort = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return `AED ${v.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
};
export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", ...(iso.length === 10 ? { timeZone: "UTC" } : {}) }) : "To be confirmed";

export function Status({ tone = "plain", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`cp-status${tone === "plain" ? "" : ` is-${tone}`}`}>{children}</span>;
}

export function PageHead({ eyebrow, title, text, actions }: { eyebrow: string; title: string; text: string; actions?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="cp-page-head">
      <div><div className="cp-eyebrow">{t(eyebrow)}</div><h1>{t(title)}</h1><p>{t(text)}</p></div>
      {actions && <div className="cp-head-actions">{actions}</div>}
    </div>
  );
}

export function CardHead({ title, text, aside }: { title: string; text?: string; aside?: ReactNode }) {
  const { t } = useI18n();
  return <div className="cp-card-head"><div><h2>{t(title)}</h2>{text && <p>{t(text)}</p>}</div>{aside}</div>;
}

export function Kpi({ label, value, sub, icon: Icon, highlight, span = "cp-span-3" }: { label: string; value: ReactNode; sub: string; icon: LucideIcon; highlight?: boolean; span?: string }) {
  const { t } = useI18n();
  return (
    <div className={`cp-card cp-kpi ${span}${highlight ? " is-highlight" : ""}`}>
      <div className="cp-k-label">{t(label)}</div>
      <div className="cp-k-icon" aria-hidden="true"><Icon /></div>
      <div className="cp-k-value">{value}</div>
      <div className="cp-k-sub">{t(sub)}</div>
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  const { t } = useI18n();
  return <div className="cp-empty"><strong>{t(title)}</strong>{t(text)}{action && <div>{action}</div>}</div>;
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="cp-list" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="cp-list-item"><div className="cp-skeleton" style={{ width: 38, height: 38 }} /><div className="cp-grow"><div className="cp-skeleton" style={{ width: "60%" }} /><div className="cp-skeleton" style={{ width: "35%", marginTop: 6, minHeight: 12 }} /></div></div>)}</div>;
}

export function LoadError({ error }: { error: unknown }) {
  return <p role="alert" className="cp-error">{error instanceof Error ? error.message : "Something went wrong."}</p>;
}

export function ArtistPhoto({ name, hue, className = "cp-artist-photo" }: { name: string; hue: number | null | undefined; className?: string }) {
  const h = hue ?? 30;
  return <div className={className} aria-hidden="true" style={{ background: `linear-gradient(135deg, oklch(0.42 0.08 ${h}), oklch(0.62 0.12 ${h + 40}))` }}>{initials(name || "?")}</div>;
}

export function Modal({ open, onClose, title, text, wide, children }: { open: boolean; onClose: () => void; title: string; text?: string; wide?: boolean; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`cp-modal${wide ? " is-wide" : ""}`}>
        <div className="cp-modal-head"><div><DialogTitle asChild><h2>{t(title)}</h2></DialogTitle>{text ? <DialogDescription asChild><p>{t(text)}</p></DialogDescription> : <DialogDescription className="sr-only">{t(title)}</DialogDescription>}</div></div>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function Field({ label, htmlFor, full, hint, bad, children }: { label: string; htmlFor: string; full?: boolean; hint?: string | null | undefined; bad?: boolean; children: ReactNode }) {
  const { t } = useI18n();
  return <div className={`cp-form-field${full ? " is-full" : ""}`}><label htmlFor={htmlFor}>{t(label)}</label>{children}{hint ? <span className={`cp-hint${bad ? " is-bad" : ""}`} id={`${htmlFor}-hint`}>{t(hint)}</span> : null}</div>;
}
