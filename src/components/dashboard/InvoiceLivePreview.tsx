import { FileText } from "lucide-react";
import type { Invoice } from "@/lib/invoice";
import { useI18n } from "@/lib/i18n";
import { InvoicePaper } from "./InvoicePaper";

/** Cream invoice sheet shown while the artist builds an invoice, as in the design reference. */
export function InvoiceLivePreview({ invoice, client, clientEmail, eventDate, artistName, issued, due, trn }: {
  invoice: Invoice | null; client: string | null; clientEmail?: string | null | undefined; eventDate?: string | null | undefined; artistName: string; issued: string; due: string | null; trn?: string | null | undefined;
}) {
  const { t } = useI18n();
  void eventDate;
  return (
    <section aria-label={t("Live invoice preview")} className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center justify-between text-[13px] font-bold text-muted-foreground">
        <span className="flex items-center gap-2"><FileText className="h-4 w-4" aria-hidden />{t("Live preview")}</span>
        <span className="inline-block -rotate-6 rounded-lg border-[3px] border-double border-gold px-2.5 py-[3px] text-[11px] font-black uppercase tracking-[.18em] text-gold opacity-90">{t("Draft")}</span>
      </div>
      <div data-testid="invoice-live-preview" className="rounded-[22px] border border-border bg-[radial-gradient(ellipse_at_50%_0%,rgba(232,176,74,.12),transparent_60%),#0a0d18] p-[22px]">
        <InvoicePaper data={{ number: null, artistName, client, clientEmail, issued, due, items: invoice?.items ?? [], subtotal: invoice?.subtotal ?? 0, vat: invoice?.vat ?? 0, total: invoice?.total ?? 0, status: "draft", notes: invoice?.notes ?? null, trn }} />
      </div>
    </section>
  );
}
