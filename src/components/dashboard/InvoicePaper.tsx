import type { InvoiceItem } from "@/lib/invoice";
import { issuerLines } from "@/lib/site-settings";
import { invoiceMoney as aed } from "@/lib/invoice";
import { useI18n } from "@/lib/i18n";
import { useSiteSettings } from "@/hooks/use-site-settings";

export type PaperStatus = "draft" | "unpaid" | "partial" | "paid" | "expired" | "none";

export type PaperData = {
  number: string | null;
  artistName: string;
  client: string | null;
  clientEmail?: string | null | undefined;
  issued: string | null;
  due: string | null;
  items: InvoiceItem[];
  subtotal: number;
  vat: number;
  total: number;
  paid?: number;
  paidAt?: string | null | undefined;
  status: PaperStatus;
  notes: string | null;
  trn?: string | null | undefined;
};

const fmtDate = (d: string | null | undefined, long = false) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("en-GB", { day: "numeric", month: long ? "long" : "short", year: "numeric" }) : "Not set");
const meta = "mb-[3px] block text-[9.5px] font-extrabold uppercase tracking-[.14em] text-[#7a7062]";
const th = "border-b-[1.5px] border-[#1a1712] pb-2 text-start text-[9.5px] font-extrabold uppercase tracking-[.14em] text-[#7a7062]";
const td = "border-b border-[#e7dcc6] py-3 align-top";
const STAMP: Record<PaperStatus, { color: string; word: string }> = {
  draft: { color: "text-[#6f665a]", word: "DRAFT" }, unpaid: { color: "text-[#b4302a]", word: "UNPAID" },
  partial: { color: "text-[#b07a1f]", word: "PARTIALLY PAID" }, paid: { color: "text-[#2f7a45]", word: "PAID" },
  expired: { color: "text-[#6f665a]", word: "EXPIRED" }, none: { color: "", word: "" },
};

/** The cream invoice sheet from the design reference. Used for the live preview, the sent-invoice popup and the PDF. */
export function InvoicePaper({ data, tall = false, a4 = false }: { data: PaperData; tall?: boolean; /** Always the 794px A4 layout, whatever the screen: the caller scales it. */ a4?: boolean }) {
  const { t } = useI18n();
  const { status } = data;
  const issuer = useSiteSettings().invoice;
  const paid = Math.min(data.total, data.paid ?? 0);
  const balance = Math.max(0, data.total - paid);
  const stamp = STAMP[status];
  const sub = status === "draft" ? "NOT SENT" : status === "expired" ? "NO LONGER PAYABLE" : status === "paid" ? `PAID ${fmtDate(data.paidAt ?? data.issued).toUpperCase()}` : `BALANCE ${aed(balance).toUpperCase()}`;
  // A draft, an expired bill and one without a saved payment state show no money received or owed.
  const settles = status === "unpaid" || status === "partial" || status === "paid";
  return (
    <article data-testid="invoice-paper" dir="ltr" className={`relative flex flex-col overflow-hidden rounded-md bg-[#fbf7ef] px-6 pb-8 pt-10 text-[13px] leading-normal text-[#1a1712] shadow-[0_30px_70px_rgba(0,0,0,.45),0_0_0_1px_rgba(255,255,255,.04)] before:absolute before:inset-x-0 before:top-0 before:h-1.5 before:bg-[linear-gradient(90deg,#f0c062,#d4842a)] before:content-[''] sm:px-10 ${a4 ? "aspect-[210/297] w-[794px] !px-[54px] !pb-10 !pt-[52px]" : tall ? "mx-auto w-full max-w-[794px] sm:aspect-[210/297] sm:px-[54px] sm:pb-10 sm:pt-[52px]" : ""}`}>
      {issuer.accent && <span aria-hidden="true" className="absolute inset-x-0 top-0 z-10 h-1.5" style={{ background: issuer.accent }} />}
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          {issuer.logoUrl ? <img src={issuer.logoUrl} alt={issuer.legalName || "Dealmaker"} className="block h-10 max-w-[200px] object-contain object-left" /> : <b className="block font-display text-[34px] font-normal leading-none tracking-[.04em] text-[#111]">DEALMAKER</b>}
          <small className="mt-1.5 block text-[10.5px] font-bold uppercase tracking-[.24em] text-[#7a7062]">Artist Management</small>
          {issuerLines(issuer).map((line) => <small key={line} className="mt-0.5 block max-w-[320px] break-words text-[10.5px] text-[#7a7062]">{line}</small>)}
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-[3px] text-xs">
            <dt className="font-semibold text-[#7a7062]">Artist name:</dt><dd className="break-all font-bold text-[#111]">{data.artistName || "—"}</dd>
            <dt className="font-semibold text-[#7a7062]">Invoice number:</dt><dd className="break-all font-bold text-[#111]">{data.number ?? t("Assigned on send")}</dd>
          </dl>
        </div>
        <div className="text-end">
          <h3 className="font-display text-[40px] font-normal leading-none tracking-[.02em]">INVOICE</h3>
          {status !== "none" && <span aria-label={`Status: ${stamp.word}`} className={`mt-2 inline-flex -rotate-3 flex-col items-center gap-0.5 rounded-[10px] border-[3px] border-double border-current px-3.5 py-1.5 opacity-95 ${stamp.color}`}><b className="text-[15px] font-black leading-none tracking-[.14em]">{stamp.word}</b><i className="text-[9px] font-bold not-italic tracking-[.12em]">{sub}</i></span>}
        </div>
      </header>
      <div className={`mb-6 mt-[30px] grid gap-4 border-y border-[#e7dcc6] py-4 ${a4 ? "grid-cols-[1.3fr_1fr_1fr]" : "sm:grid-cols-[1.3fr_1fr_1fr]"}`}>
        <div><span className={meta}>Bill to</span><b className="break-words text-[13.5px] font-bold">{data.client || t("Choose a client")}</b><small className="block text-[11.5px] text-[#7a7062]">{data.client ? data.clientEmail || "Email not on file" : t("Client email")}</small></div>
        <div><span className={meta}>Issued</span><b className="text-[13.5px] font-bold">{fmtDate(data.issued)}</b><small className="block text-[11.5px] text-[#7a7062]">Currency AED</small></div>
        <div><span className={meta}>Invoice due date</span><b className="text-[13.5px] font-bold">{fmtDate(data.due)}</b>{(settles || status === "draft") && <small className="block text-[11.5px] text-[#7a7062]">Balance due {aed(status === "draft" ? data.total : balance)}</small>}</div>
      </div>
      <table className="w-full border-collapse">
        <thead><tr><th className={`${th} w-7`}>#</th><th className={th}>Description</th><th className={`${th} !text-end`}>Qty</th><th className={`${th} !text-end`}>Unit price</th><th className={`${th} !text-end`}>Amount</th></tr></thead>
        <tbody>
          {data.items.length === 0 && <tr><td colSpan={5} className="border-b border-[#e7dcc6] py-[34px] text-center italic text-[#7a7062]">{t("No items yet")}</td></tr>}
          {data.items.map((it, i) => (
            <tr key={i}>
              <td className={`${td} w-7 tabular-nums text-[#7a7062]`}>{String(i + 1).padStart(2, "0")}</td>
              <td className={td}><b className="font-semibold">{it.title || t("Untitled item")}</b></td>
              <td className={`${td} text-end`}>{it.qty}</td>
              <td className={`${td} whitespace-nowrap text-end`}>{aed(it.price)}</td>
              <td className={`${td} whitespace-nowrap text-end`}>{aed(it.qty * it.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex justify-end">
        <dl className="grid w-[min(280px,100%)] grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13px]">
          <dt className="text-[#7a7062]">Subtotal</dt><dd className="text-end tabular-nums">{aed(data.subtotal)}</dd>
          <dt className="text-[#7a7062]">VAT 5%</dt><dd className="text-end tabular-nums">{aed(data.vat)}</dd>
          <dt className="mt-1 self-end border-t-[1.5px] border-[#1a1712] pt-2.5 font-display text-lg text-[#1a1712]">TOTAL</dt><dd className="mt-1 border-t-[1.5px] border-[#1a1712] pt-2.5 text-end font-display text-[26px] leading-none text-[#1a1712]">{aed(data.total)}</dd>
          {settles && <><dt className="text-[#7a7062]">Paid</dt><dd className="text-end tabular-nums">{aed(paid)}</dd><dt className="text-[#7a7062]">Balance due</dt><dd className={`text-end font-bold tabular-nums ${balance > 0 ? "text-[#b4302a]" : "text-[#2f7a45]"}`}>{aed(balance)}</dd></>}
        </dl>
      </div>
      <div className={`${tall || a4 ? "mt-auto pt-10" : "mt-[34px]"} grid grid-cols-2 items-end gap-10`}>
        <div className="flex flex-col items-start gap-[3px]"><span className="mb-1 block h-px w-full bg-[#1a1712]" /><b>( {data.client || t("Client name")} )</b><small className="text-[#7a7062]">Client of Dealmaker</small></div>
        <div className="flex flex-col items-end gap-[3px] text-end"><em className="mb-6 not-italic text-[#7a7062]">Dubai, {fmtDate(data.issued ?? new Date().toISOString().slice(0, 10), true)}</em><span className="mb-1 block h-px w-full bg-[#1a1712]" /><b>( {data.artistName || "—"} )</b><small className="text-[#7a7062]">Artist of Dealmaker Management</small></div>
      </div>
      {data.notes && <div className="mt-6 rounded-lg bg-[#f3ebdb] px-4 py-3.5 text-xs text-[#4d463b]"><span className="mb-1 block text-[9.5px] font-extrabold uppercase tracking-[.14em] text-[#b07a1f]">Notes</span>{data.notes}</div>}
      {issuer.footer && <p className="mt-[26px] whitespace-pre-line break-words text-[11px] text-[#4d463b]">{issuer.footer}</p>}
      <footer className="mt-[26px] flex justify-between gap-4 border-t border-dashed border-[#e7dcc6] pt-3.5 text-[11px] text-[#7a7062]"><span>{data.trn ? <>TRN <b className="text-[#1a1712]">{data.trn}</b></> : "TRN not added yet"}</span><span>Paid through Dealmaker. Held until the job is completed.</span></footer>
    </article>
  );
}
