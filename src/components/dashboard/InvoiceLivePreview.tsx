import { FileText } from "lucide-react";
import type { Invoice } from "@/lib/invoice";
import { invoiceMoney as aed } from "@/lib/invoice";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";

export function InvoiceLivePreview({ invoice, client, eventDate }: { invoice: Invoice | null; client: string; eventDate: string | null | undefined }) {
  const { t } = useI18n();
  return (
    <section aria-label={t("Live invoice preview")} className="min-w-0 border-t pt-6 lg:border-t-0 lg:border-s lg:ps-6 lg:pt-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4 text-muted-foreground" />{t("Live preview")}</h3>
        <Badge variant="secondary">{t("Draft")}</Badge>
      </div>
      <div className="border bg-card text-card-foreground shadow-card lg:sticky lg:top-6" data-testid="invoice-live-preview">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b p-5 sm:p-7">
          <div><div className="text-xl font-semibold">Dealmaker</div><div className="mt-1 text-xs text-muted-foreground">{t("Service invoice")}</div></div>
          <div className="text-end"><div className="text-lg font-semibold">{t("Invoice")}</div><div className="mt-1 text-xs text-muted-foreground">{t("Draft")}</div></div>
        </div>
        <div className="p-5 sm:p-7">
          <div className="mb-7 grid grid-cols-2 gap-4 text-sm">
            <div className="min-w-0"><div className="text-xs text-muted-foreground">{t("Bill to")}</div><div className="mt-1 break-words font-medium">{client}</div>{eventDate && <div className="mt-1 text-xs text-muted-foreground">{t("Event date")}: {eventDate}</div>}</div>
            <div className="text-end"><div className="text-xs text-muted-foreground">{t("Currency")}</div><div className="mt-1 font-medium">AED</div></div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(5rem,auto)] gap-2 border-b pb-3 text-xs text-muted-foreground"><span>{t("Item")}</span><span className="text-end">{t("Qty")}</span><span className="text-end">{t("Amount")}</span></div>
          <div className="min-h-36">
            {invoice?.items.map((item, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(5rem,auto)] gap-2 border-b py-4 text-sm"><div className="min-w-0 break-words"><div className="font-medium">{item.title}</div><div className="mt-1 text-xs text-muted-foreground">{aed(item.price)}</div></div><span className="text-end">{item.qty}</span><span className="break-words text-end">{aed(item.qty * item.price)}</span></div>)}
            {!invoice && <div className="py-12 text-center text-sm text-muted-foreground">{t("No items yet")}</div>}
          </div>
          <div className="mt-6 space-y-3 text-sm"><div className="flex justify-between gap-3 text-muted-foreground"><span>{t("Subtotal")}</span><span>{aed(invoice?.subtotal ?? 0)}</span></div><div className="flex justify-between gap-3 text-muted-foreground"><span>{t("VAT 5%")}</span><span>{aed(invoice?.vat ?? 0)}</span></div><div className="flex justify-between gap-3 border-t pt-4 text-lg font-semibold"><span>{t("Total")}</span><span className="text-end">{aed(invoice?.total ?? 0)}</span></div></div>
        </div>
      </div>
    </section>
  );
}