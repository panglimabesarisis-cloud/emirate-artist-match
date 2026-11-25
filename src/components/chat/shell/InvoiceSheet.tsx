import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InvoicePaper, type PaperData } from "@/components/dashboard/InvoicePaper";
import { InvoicePreviewDialog } from "@/components/dashboard/InvoicePreviewDialog";
import { archiveFromPaper, invoiceFileName } from "@/lib/chat-invoice";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { invoiceCheckout } from "@/lib/payments.functions";
import { validateHostedUrl } from "@/lib/hosted-checkout";
import { useI18n } from "@/lib/i18n";

/** A4 at 96 dpi: 210mm wide. */
const SHEET_WIDTH = 794;

/** The dashboard invoice sheet kept in A4 proportion and scaled down to the space it has. */
export function A4Fit({ data }: { data: PaperData }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; left: number; height: number | undefined }>({ scale: 1, left: 0, height: undefined });
  useLayoutEffect(() => {
    const measure = () => {
      const width = outer.current?.clientWidth;
      const height = inner.current?.offsetHeight;
      if (!width || !height) return;
      const scale = Math.min(1, width / SHEET_WIDTH);
      setFit({ scale, left: Math.max(0, Math.floor((width - SHEET_WIDTH) / 2)), height: Math.ceil(height * scale) });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    if (outer.current) observer.observe(outer.current);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={outer} data-a4-fit dir="ltr" className="relative w-full min-w-0 overflow-hidden" style={{ height: fit.height }}>
      {/* Taken out of the flow, so the 794px sheet never widens the dialog or message that holds it. */}
      <div ref={inner} data-a4-scale style={{ position: "absolute", top: 0, left: fit.left, width: SHEET_WIDTH, transform: `scale(${fit.scale})`, transformOrigin: "top left" }}>
        <InvoicePaper data={data} a4 />
      </div>
    </div>
  );
}

export function downloadPaper(paper: PaperData) {
  const url = URL.createObjectURL(new Blob([buildInvoicePdf(archiveFromPaper(paper)) as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = invoiceFileName(paper);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DownloadInvoiceButton({ paper }: { paper: PaperData }) {
  const { t } = useI18n();
  const download = () => {
    try { downloadPaper(paper); }
    catch { toast.error(t("Could not create the invoice file.")); }
  };
  return <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={download}><Download className="me-1.5 h-4 w-4" />{t("Download PDF")}</Button>;
}

/** The full-size preview, with download and print. */
export function ChatInvoiceDialog({ paper, onClose }: { paper: PaperData | null; onClose: () => void }) {
  return <InvoicePreviewDialog data={paper} onClose={onClose} sheet={paper ? <A4Fit data={paper} /> : null} {...(paper ? { onDownload: () => downloadPaper(paper) } : {})} />;
}

/** One invoice as it appears in a chat or a list: the A4 sheet with its actions underneath. */
export function InvoiceBlock({ paper, actions }: { paper: PaperData; actions?: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="dmc-invoice w-full max-w-[560px]">
      <A4Fit data={paper} />
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {actions}
        <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}><FileText className="me-1.5 h-4 w-4" />{t("View invoice")}</Button>
        <DownloadInvoiceButton paper={paper} />
      </div>
      <ChatInvoiceDialog paper={open ? paper : null} onClose={() => setOpen(false)} />
    </div>
  );
}

/** Pays a chat invoice: a booking invoice goes to its booking page, any other to Stripe's test checkout. */
export function usePayInvoice(conversationId: string, linkKey: string) {
  const checkout$ = useServerFn(invoiceCheckout);
  return async (invoiceId: string) => {
    const r = await checkout$({ data: { invoiceId, conversationId, key: linkKey } });
    if ("error" in r) throw new Error(r.error);
    window.location.assign("bookingUrl" in r ? r.bookingUrl : validateHostedUrl(r.checkoutUrl));
  };
}
