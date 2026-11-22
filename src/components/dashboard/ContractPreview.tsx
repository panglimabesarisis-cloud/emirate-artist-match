import { useState } from "react";
import { DollarSign, Printer, ShoppingCart, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { BillingPanel } from "./BillingPanel";
import "./invoice-print.css";

export type ContractDoc = {
  number: string;
  templateName: string;
  stamp: { word: string; sub: string; tone: "template" | "awaiting" | "accepted" };
  parties?: [string, string | null | undefined][];
  jobDetail?: string | null | undefined;
  clauses: { title: string; body: string }[];
  rider?: string | null | undefined;
  intro?: string;
  footer?: string;
};

const TONE = { template: "text-[#6f665a]", awaiting: "text-[#b07a1f]", accepted: "text-[#2f7a45]" };

/** Grey bars standing in for the text of a locked contract. The real clauses are not sent to the page, so nothing can be read behind the blur. */
function Skeleton() {
  const widths = [96, 88, 92, 70, 100, 84, 90, 62];
  return (
    <div aria-hidden className="mt-6 select-none space-y-5 blur-[5px]">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="space-y-2">
          <div className="h-3.5 w-2/5 rounded bg-[#1b1d2a]/70" />
          {widths.slice(0, 4 + (n % 3)).map((w, i) => <div key={i} className="h-2.5 rounded bg-[#5a5d6e]/45" style={{ width: `${w - (i * n) % 11}%` }} />)}
        </div>
      ))}
    </div>
  );
}

/** The cream contract sheet shared by booking contracts and templates. */
export function ContractPaper({ doc, locked, t }: { doc: ContractDoc; locked: boolean; t: (s: string) => string }) {
  return (
    <article data-paper dir="ltr" className="relative mx-auto w-full max-w-[794px] overflow-hidden rounded-md bg-[#fbf7ef] px-6 pb-9 pt-10 text-[13px] leading-relaxed text-[#1a1712] shadow-[0_30px_70px_rgba(0,0,0,.45)] before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:bg-[linear-gradient(90deg,#f0c062,#d4842a)] before:content-[''] sm:px-[54px]">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <b className="block font-display text-[34px] font-normal leading-none tracking-[.04em] text-[#111]">DEALMAKER</b>
          <small className="mt-1.5 block text-[10.5px] font-bold uppercase tracking-[.24em] text-[#7a7062]">Artist Management</small>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-[3px] text-xs">
            <dt className="font-semibold text-[#7a7062]">{t("Contract number")}</dt><dd className="break-all font-bold text-[#111]">{doc.number}</dd>
            <dt className="font-semibold text-[#7a7062]">{t("Template")}</dt><dd className="break-words font-bold text-[#111]">{doc.templateName}</dd>
          </dl>
        </div>
        <div className="text-end">
          <h3 className="font-display text-[30px] font-normal leading-none tracking-[.02em]">{t("CONTRACT")}</h3>
          <span className={`mt-2 inline-flex -rotate-3 flex-col items-center gap-0.5 rounded-[10px] border-[3px] border-double border-current px-3.5 py-1.5 ${TONE[doc.stamp.tone]}`}><b className="text-[15px] font-black leading-none tracking-[.14em]">{doc.stamp.word}</b><i className="text-[9px] font-bold not-italic tracking-[.12em]">{doc.stamp.sub}</i></span>
        </div>
      </header>

      {doc.intro && <p className="mt-6 border-t border-[#e7dcc6] pt-4 text-[#4d463b]">{doc.intro}</p>}
      {doc.parties && doc.parties.length > 0 && (
        <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 border-y border-[#e7dcc6] py-3.5">
          {doc.parties.map(([k, v]) => <div key={k} className="contents"><dt className="text-[11px] font-extrabold uppercase tracking-[.1em] text-[#7a7062]">{t(k)}</dt><dd className="break-words font-semibold">{v || "—"}</dd></div>)}
        </dl>
      )}
      {doc.jobDetail && <p className="mt-4 whitespace-pre-wrap break-words text-[#4d463b]">{doc.jobDetail}</p>}

      {locked ? <Skeleton /> : (
        <>
          <ol className="mt-6 space-y-4">
            {doc.clauses.map((c, i) => (
              <li key={i}><b className="block text-[13.5px] text-[#111]">{t("Article")} {i + 1}{c.title ? ` · ${c.title}` : ""}</b><p className="mt-1 whitespace-pre-wrap break-words text-[#2a2d3d]">{c.body}</p></li>
            ))}
          </ol>
          {doc.rider && <div className="mt-6 rounded-lg bg-[#f3ebdb] px-4 py-3.5 text-xs text-[#4d463b]"><span className="mb-1 block text-[9.5px] font-extrabold uppercase tracking-[.14em] text-[#b07a1f]">{t("Schedule C: technical and hospitality rider")}</span><p className="whitespace-pre-wrap">{doc.rider}</p></div>}
        </>
      )}
      {doc.footer && <footer className="mt-7 border-t border-dashed border-[#e7dcc6] pt-3.5 text-[11px] text-[#7a7062]">{doc.footer}</footer>}

      {locked && (
        <div className="absolute inset-x-0 bottom-0 top-[230px] grid place-items-center bg-[#fbf7ef]/35 px-6 text-center">
          <div className="flex max-w-xs flex-col items-center gap-2.5">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-gold text-gold-foreground shadow-[0_12px_30px_rgba(232,164,63,.4)]"><DollarSign className="h-8 w-8" strokeWidth={2.5} aria-hidden /></span>
            <b className="font-display text-2xl font-normal text-[#111]">{t("This contract is locked")}</b>
            <p className="text-[13px] text-[#4d463b]">{t("It is not part of your plan. Buy it to read and use it.")}</p>
          </div>
        </div>
      )}
    </article>
  );
}

/** "Booking contract · Dealmaker" popup: Print / PDF, and for a contract outside the artist's plan a blurred sheet with a Buy contract button. */
export function ContractPreviewDialog({ doc, title, locked = false, planName, artistId, onClose }: { doc: ContractDoc | null; title: string; locked?: boolean; planName?: string; artistId: string; onClose: () => void }) {
  const { t } = useI18n();
  const [buying, setBuying] = useState(false);
  const print = () => {
    document.body.classList.add("inv-printing");
    const done = () => { document.body.classList.remove("inv-printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.setTimeout(() => window.print(), 50);
  };
  return (
    <>
      <Dialog open={!!doc && !buying} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent data-ivp-print="true" className="max-h-[calc(100dvh-40px)] w-[min(860px,calc(100vw-24px))] max-w-none gap-0 overflow-y-auto rounded-[26px] border-[var(--studio-line-2,rgba(246,239,226,.16))] bg-[linear-gradient(180deg,#141a2e,#0b0f1d)] p-0 [&>button.absolute]:hidden">
          <div className="ivp-bar sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-[rgba(17,22,38,.95)] px-[22px] py-4 backdrop-blur">
            <DialogTitle className="font-display text-[26px] font-normal leading-none tracking-normal">{title}</DialogTitle>
            <div className="flex flex-wrap gap-2.5">
              <Button type="button" variant="outline" className="rounded-full" onClick={print} disabled={locked}><Printer className="me-2 h-4 w-4" />{t("Print / PDF")}</Button>
              {locked && <Button type="button" className="rounded-full bg-gradient-gold font-bold text-gold-foreground" onClick={() => setBuying(true)}><ShoppingCart className="me-2 h-4 w-4" />{t("Buy contract")}</Button>}
              <DialogClose asChild><Button type="button" variant="outline" size="icon" aria-label={t("Close preview")}><X className="h-4 w-4" /></Button></DialogClose>
            </div>
          </div>
          <DialogDescription className="sr-only">{t("Preview of the contract")}</DialogDescription>
          <div className="ivp-sheet p-3 sm:p-7">{doc && <ContractPaper doc={doc} locked={locked} t={t} />}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={buying} onOpenChange={(o) => { if (!o) setBuying(false); }}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto rounded-[24px] border-border bg-gradient-to-b from-[#141a2e] to-[#0c1120]">
          <DialogTitle className="font-display text-3xl font-normal">{t("Buy")} <span className="it">{t("contract")}</span></DialogTitle>
          <DialogDescription>{doc?.templateName ? `"${doc.templateName}" ${t("is part of the")} ${planName ?? t("higher")} ${t("plan and above.")}` : ""} {t("Upgrade your plan to unlock it. Contracts you already accepted keep their terms.")}</DialogDescription>
          <BillingPanel artistId={artistId} />
          <div className="flex justify-end"><Button type="button" variant="outline" className="rounded-full" onClick={() => setBuying(false)}>{t("Back to the contract")}</Button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
