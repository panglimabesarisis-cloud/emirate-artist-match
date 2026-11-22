import { useEffect, useRef, useState } from "react";
import { DollarSign, Printer, ShoppingCart, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { BillingPanel } from "./BillingPanel";
import { ItemCheckoutDialog } from "./ItemCheckoutDialog";
import "./invoice-print.css";
import "./contract-pages.css";
import { paginateContract } from "./contract-pagination";

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

function ContractHeader({ doc, t }: { doc: ContractDoc; t: (s: string) => string }) {
  return <header data-contract-block className="contract-page-header">
    <div><b className="contract-page-brand">DEALMAKER</b><small className="contract-page-tag">Artist Management</small><dl className="contract-page-identifiers"><dt>{t("Contract number")}</dt><dd>{doc.number}</dd><dt>{t("Template")}</dt><dd>{doc.templateName}</dd></dl></div>
    <div className="contract-page-title"><h3>{t("CONTRACT")}</h3><span className="contract-page-stamp" data-tone={doc.stamp.tone}><b>{doc.stamp.word}</b><i>{doc.stamp.sub}</i></span></div>
  </header>;
}

/** Fixed A4 pages, measured at full size before the entire paper is fitted to the screen. */
export function ContractPaper({ doc, locked, t }: { doc: ContractDoc; locked: boolean; t: (s: string) => string }) {
  const frame = useRef<HTMLDivElement | null>(null);
  const source = useRef<HTMLDivElement | null>(null);
  const pages = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const container = frame.current;
    if (!container) return;
    const fit = () => { const width = container.clientWidth; if (width) setScale(Math.min(1, width / 794)); };
    fit();
    const observer = new ResizeObserver(fit); observer.observe(container);
    let disposed = false;
    const rebuild = () => {
      if (disposed || locked || !source.current || !pages.current) return;
      paginateContract(source.current, pages.current, `${doc.templateName} · ${doc.number}`, (page, total) => `${t("Page")} ${page} ${t("of")} ${total}`);
    };
    rebuild();
    void document.fonts.ready.then(rebuild);
    document.fonts.addEventListener("loadingdone", rebuild);
    return () => { disposed = true; observer.disconnect(); document.fonts.removeEventListener("loadingdone", rebuild); };
  }, [doc, locked, t]);
  return <div ref={frame} className="contract-preview-frame">
    <div key={locked ? "locked" : "unlocked"} ref={pages} className="contract-pages" style={{ zoom: scale }}>
      {locked && <article data-paper dir="ltr" className="contract-a4-page" aria-label={`${t("Page")} 1 ${t("of")} 1`}>
        <div className="contract-a4-body"><ContractHeader doc={doc} t={t} /><div className="contract-skeleton" aria-hidden>{Array.from({ length: 20 }, (_, index) => <div key={index} />)}</div></div>
        <footer className="contract-page-footer"><span>{doc.number}</span><span>{t("Page")} 1 {t("of")} 1</span></footer>
        <div className="contract-locked-overlay"><div><span className="grid h-16 w-16 place-items-center rounded-full bg-gradient-gold text-gold-foreground"><DollarSign className="h-8 w-8" aria-hidden /></span><strong>{t("This contract is locked")}</strong><p>{t("Access is required to read and use this contract.")}</p></div></div>
      </article>}
    </div>
    {!locked && <div ref={source} className="contract-measure-source" dir="ltr" aria-hidden="true">
      <ContractHeader doc={doc} t={t} />
      {doc.intro && <p data-contract-block className="contract-page-intro"><span data-pagination-text>{doc.intro}</span></p>}
      {doc.parties?.map(([label, value], index) => <dl data-contract-block className="contract-page-party" key={`${label}-${index}`}><dt>{t(label)}</dt><dd data-pagination-text>{value || "—"}</dd></dl>)}
      {doc.jobDetail && <p data-contract-block className="contract-page-paragraph"><span data-pagination-text>{doc.jobDetail}</span></p>}
      {doc.clauses.flatMap((clause, index) => clause.body.split(/\n\s*\n/).map((paragraph, part, all) => <div data-contract-block key={`${index}-${part}`} className="contract-page-article">
        {part === 0 && <h4 data-pagination-heading><span>{t("Article")} {index + 1}</span>{clause.title}</h4>}
        <p>{all.length > 1 && <b className="me-2">{index + 1}.{part + 1}</b>}<span data-pagination-text>{paragraph}</span></p>
      </div>))}
      {doc.rider && doc.rider.split("\n").map((line, index) => <div data-contract-block key={`rider-${index}`} className="contract-page-rider">{index === 0 && <h4 data-pagination-heading>{t("Schedule C: technical and hospitality rider")}</h4>}<p data-pagination-text>{line || "\u00a0"}</p></div>)}
      {doc.footer && <p data-contract-block className="contract-page-note"><span data-pagination-text>{doc.footer}</span></p>}
    </div>}
  </div>;
}

/** "Booking contract · Dealmaker" popup: Print / PDF, and for a contract outside the artist's plan a blurred sheet with a Buy contract button. */
export function ContractPreviewDialog({ doc, title, locked = false, purchaseRequired = false, planName, artistId, templateId, priceAed = 0, onPaid, onClose }: { doc: ContractDoc | null; title: string; locked?: boolean; purchaseRequired?: boolean; planName?: string; artistId?: string; templateId?: string; priceAed?: number; onPaid?: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const [buying, setBuying] = useState(false);
  const [paying, setPaying] = useState(false);
  const print = () => {
    document.body.classList.add("inv-printing");
    const done = () => { document.body.classList.remove("inv-printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.setTimeout(() => window.print(), 50);
  };
  return (
    <>
      <Dialog open={!!doc && !buying} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent data-ivp-print="true" className="contract-preview-dialog">
          <div className="ivp-bar contract-preview-bar sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border px-[22px] py-4 backdrop-blur">
            <DialogTitle className="font-display text-[26px] font-normal leading-none tracking-normal">{title}</DialogTitle>
            <div className="flex flex-wrap gap-2.5">
              <Button type="button" variant="outline" className="rounded-full" onClick={print} disabled={locked}><Printer className="me-2 h-4 w-4" />{t("Print / PDF")}</Button>
              {locked && purchaseRequired && templateId && <Button type="button" className="rounded-full bg-gradient-gold font-bold text-gold-foreground" onClick={() => setPaying(true)}><ShoppingCart className="me-2 h-4 w-4" />{t("Buy contract")} · AED {(priceAed * 1.05).toFixed(2)}</Button>}
              {locked && !purchaseRequired && <Button type="button" className="rounded-full bg-gradient-gold font-bold text-gold-foreground" onClick={() => setBuying(true)}><ShoppingCart className="me-2 h-4 w-4" />{t("Buy contract")}</Button>}
              <DialogClose asChild><Button type="button" variant="outline" size="icon" aria-label={t("Close preview")}><X className="h-4 w-4" /></Button></DialogClose>
            </div>
          </div>
          <DialogDescription className="sr-only">{t("Preview of the contract")}</DialogDescription>
          <div className="ivp-sheet p-3 sm:p-7">{doc && <ContractPaper doc={doc} locked={locked} t={t} />}</div>
        </DialogContent>
      </Dialog>

      {templateId && doc && <ItemCheckoutDialog kind="contract_template" itemId={templateId} title={doc.templateName} priceAed={priceAed} open={paying} onClose={() => setPaying(false)} onPaid={() => { setPaying(false); onPaid?.(); }} />}

      <Dialog open={buying} onOpenChange={(o) => { if (!o) setBuying(false); }}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto rounded-[24px] border-border bg-gradient-to-b from-[#141a2e] to-[#0c1120]">
          <DialogTitle className="font-display text-3xl font-normal">{t("Buy")} <span className="it">{t("contract")}</span></DialogTitle>
          <DialogDescription>{doc?.templateName ? `"${doc.templateName}" ${t("is part of the")} ${planName ?? t("higher")} ${t("plan and above.")}` : ""} {t("Upgrade your plan to unlock it. Contracts you already accepted keep their terms.")}</DialogDescription>
          {artistId && <BillingPanel artistId={artistId} />}
          <div className="flex justify-end"><Button type="button" variant="outline" className="rounded-full" onClick={() => setBuying(false)}>{t("Back to the contract")}</Button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
