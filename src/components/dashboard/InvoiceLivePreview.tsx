import { FileText } from "lucide-react";
import type { Invoice } from "@/lib/invoice";
import { invoiceMoney as aed } from "@/lib/invoice";
import { useI18n } from "@/lib/i18n";

const fmtDate = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not set");
const meta = "mb-[3px] block text-[9.5px] font-extrabold uppercase tracking-[.14em] text-[#7a7062]";
const th = "border-b-[1.5px] border-[#1a1712] pb-2 text-start text-[9.5px] font-extrabold uppercase tracking-[.14em] text-[#7a7062]";

/** Cream invoice sheet shown while the artist builds an invoice, as in the design reference. */
export function InvoiceLivePreview({ invoice, client, clientEmail, eventDate, artistName, issued, due, trn }: {
  invoice: Invoice | null; client: string | null; clientEmail?: string | null | undefined; eventDate?: string | null | undefined; artistName: string; issued: string; due: string | null; trn?: string | null | undefined;
}) {
  const { t } = useI18n();
  const items = invoice?.items ?? [];
  const total = invoice?.total ?? 0;
  void eventDate;
  return (
    <section aria-label={t("Live invoice preview")} className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center justify-between text-[13px] font-bold text-muted-foreground">
        <span className="flex items-center gap-2"><FileText className="h-4 w-4" aria-hidden />{t("Live preview")}</span>
        <span className="inline-block -rotate-6 rounded-lg border-[3px] border-double border-gold px-2.5 py-[3px] text-[11px] font-black uppercase tracking-[.18em] text-gold opacity-90">{t("Draft")}</span>
      </div>
      <div className="rounded-[22px] border border-border bg-[radial-gradient(ellipse_at_50%_0%,rgba(232,176,74,.12),transparent_60%),#0a0d18] p-[22px]">
        <article data-testid="invoice-live-preview" className="relative overflow-hidden rounded-md bg-[#fbf7ef] px-6 pb-8 pt-10 text-[13px] leading-normal text-[#1a1712] shadow-[0_30px_70px_rgba(0,0,0,.45),0_0_0_1px_rgba(255,255,255,.04)] before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:bg-[linear-gradient(90deg,#f0c062,#d4842a)] before:content-[''] sm:px-10" dir="ltr">
          <header className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <b className="block text-[30px] font-extrabold leading-none tracking-[.06em] text-[#111]">DEALMAKER</b>
              <small className="mt-1.5 block text-[10.5px] font-bold uppercase tracking-[.24em] text-[#b07a1f]">Artist Management</small>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-[3px] text-xs">
                <dt className="font-semibold text-[#7a7062]">Artist name:</dt><dd className="break-all font-bold text-[#111]">{artistName}</dd>
                <dt className="font-semibold text-[#7a7062]">Invoice number:</dt><dd className="break-all font-bold text-[#111]">{t("Assigned on send")}</dd>
              </dl>
            </div>
            <div className="text-end">
              <h3 className="font-display text-[38px] font-normal leading-none">INVOICE</h3>
              <span className="mt-2 inline-flex flex-col items-center gap-0.5 rounded-[10px] border-[3px] border-double border-[#6f665a] px-3.5 py-1.5 text-[#6f665a] opacity-95"><b className="text-[15px] font-black leading-none tracking-[.14em]">DRAFT</b><i className="text-[9px] font-bold not-italic tracking-[.12em]">NOT SENT</i></span>
            </div>
          </header>
          <div className="my-[30px] mb-6 grid gap-4 border-y border-[#e7dcc6] py-4 sm:grid-cols-[1.3fr_1fr_1fr]">
            <div><span className={meta}>Bill to</span><b className="break-words text-[13.5px] font-bold">{client || t("Choose a client")}</b><small className="block text-[11.5px] text-[#7a7062]">{client ? clientEmail || "—" : t("Client email")}</small></div>
            <div><span className={meta}>Issued</span><b className="text-[13.5px] font-bold">{fmtDate(issued)}</b><small className="block text-[11.5px] text-[#7a7062]">Currency AED</small></div>
            <div><span className={meta}>Invoice due date</span><b className="text-[13.5px] font-bold">{fmtDate(due)}</b><small className="block text-[11.5px] text-[#7a7062]">Balance due {aed(total)}</small></div>
          </div>
          <table className="w-full border-collapse">
            <thead><tr><th className={`${th} w-7`}>#</th><th className={th}>Description</th><th className={`${th} text-end`}>Qty</th><th className={`${th} text-end`}>Unit price</th><th className={`${th} text-end`}>Amount</th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={5} className="border-b border-[#e7dcc6] py-[34px] text-center italic text-[#7a7062]">{t("No items yet")}</td></tr>}
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="w-7 border-b border-[#e7dcc6] py-3 align-top tabular-nums text-[#7a7062]">{String(i + 1).padStart(2, "0")}</td>
                  <td className="border-b border-[#e7dcc6] py-3 align-top"><b className="font-semibold">{it.title || t("Untitled item")}</b></td>
                  <td className="border-b border-[#e7dcc6] py-3 text-end align-top">{it.qty}</td>
                  <td className="border-b border-[#e7dcc6] py-3 text-end align-top">{aed(it.price)}</td>
                  <td className="border-b border-[#e7dcc6] py-3 text-end align-top">{aed(it.qty * it.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex justify-end">
            <dl className="grid w-[min(280px,100%)] grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-[#7a7062]">Subtotal</dt><dd className="text-end tabular-nums">{aed(invoice?.subtotal ?? 0)}</dd>
              <dt className="text-[#7a7062]">VAT 5%</dt><dd className="text-end tabular-nums">{aed(invoice?.vat ?? 0)}</dd>
              <dt className="mt-1 self-end border-t-[1.5px] border-[#1a1712] pt-2.5 text-lg text-[#1a1712]">Total</dt><dd className="mt-1 border-t-[1.5px] border-[#1a1712] pt-2.5 text-end font-display text-[26px] leading-none text-[#1a1712]">{aed(total)}</dd>
            </dl>
          </div>
          <div className="mt-[34px] grid grid-cols-2 items-end gap-10">
            <div className="flex flex-col items-start gap-[3px]"><span className="mb-1 block h-px w-full bg-[#1a1712]" /><b>( {client || t("Client name")} )</b><small className="text-[#7a7062]">Client of Dealmaker</small></div>
            <div className="flex flex-col items-end gap-[3px] text-end"><em className="not-italic text-[#7a7062]">Dubai, {new Date(`${issued}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</em><span className="mb-1 block h-px w-full bg-[#1a1712]" /><b>( {artistName} )</b><small className="text-[#7a7062]">Artist of Dealmaker Management</small></div>
          </div>
          {invoice?.notes && <div className="mt-6 rounded-lg bg-[#f3ebdb] px-4 py-3.5 text-xs text-[#4d463b]"><span className="mb-1 block text-[9.5px] font-extrabold uppercase tracking-[.14em] text-[#b07a1f]">Notes</span>{invoice.notes}</div>}
          <footer className="mt-[26px] flex justify-between gap-4 border-t border-dashed border-[#e7dcc6] pt-3.5 text-[11px] text-[#7a7062]"><span>{trn ? <>TRN <b className="text-[#1a1712]">{trn}</b></> : "TRN not added yet"}</span><span>Paid through Dealmaker. Held until the job is completed.</span></footer>
        </article>
      </div>
    </section>
  );
}
