import { Download, Printer, X } from "lucide-react";
import type { ReactNode } from "react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { InvoicePaper, type PaperData } from "./InvoicePaper";
import "./invoice-print.css";

/** "Invoice preview" popup from the design reference, with Print / PDF. */
export function InvoicePreviewDialog({ data, onClose, onDownload, sheet }: { data: PaperData | null; onClose: () => void; onDownload?: () => void; /** Replaces the default sheet, e.g. one scaled to keep A4 on small screens. */ sheet?: ReactNode }) {
  const { t } = useI18n();
  const print = () => {
    document.body.classList.add("inv-printing");
    const done = () => { document.body.classList.remove("inv-printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.setTimeout(() => window.print(), 50);
  };
  return (
    <Dialog open={!!data} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent data-ivp-print="true" className="max-h-[calc(100dvh-40px)] w-[min(820px,calc(100vw-24px))] max-w-none gap-0 overflow-y-auto rounded-[26px] border-[var(--studio-line-2,rgba(246,239,226,.16))] bg-[linear-gradient(180deg,#141a2e,#0b0f1d)] p-0 [&>button.absolute]:hidden">
        <div className="ivp-bar sticky top-0 z-10 flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-[rgba(17,22,38,.95)] px-[22px] py-4 backdrop-blur">
          <DialogTitle className="font-display text-[28px] font-normal leading-none tracking-normal">{t("Invoice")} <span className="it">{t("preview")}</span></DialogTitle>
          <div className="flex flex-wrap gap-2.5">
            {onDownload && <Button type="button" variant="outline" className="rounded-full" onClick={onDownload}><Download className="me-2 h-4 w-4" />{t("Download PDF")}</Button>}
            <Button type="button" variant="outline" className="rounded-full" onClick={print}><Printer className="me-2 h-4 w-4" />{t("Print / PDF")}</Button>
            <DialogClose asChild><Button type="button" variant="outline" size="icon" aria-label={t("Close preview")}><X className="h-4 w-4" /></Button></DialogClose>
          </div>
        </div>
        <DialogDescription className="sr-only">{t("Preview of the invoice as the client receives it")}</DialogDescription>
        <div className="ivp-sheet min-w-0 p-3 sm:p-7">{data && (sheet ?? <InvoicePaper data={data} tall />)}</div>
      </DialogContent>
    </Dialog>
  );
}
