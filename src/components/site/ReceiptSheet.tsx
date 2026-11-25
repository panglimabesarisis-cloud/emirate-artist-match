import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PaidStamp } from "./PaidStamp";
import { useI18n } from "@/lib/i18n";
import { invoiceMoney as aed } from "@/lib/invoice";
import { downloadReceipt, receiptDate } from "@/lib/receipt-pdf";
import type { Receipt } from "@/lib/receipt";
import "./receipt.css";

/** The invoice paper shown before payment and, with the animated PAID stamp, after it. */
export function ReceiptSheet({ receipt }: { receipt: Receipt }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const paid = receipt.status === "paid";
  const download = () => {
    setBusy(true);
    try { downloadReceipt(receipt); } catch (error) { toast.error(error instanceof Error ? error.message : t("Could not create the invoice file.")); }
    finally { setBusy(false); }
  };
  return (
    <div className="dm-receipt-wrap">
      <article className="dm-receipt" dir="ltr" aria-label={`${t("Invoice")} ${receipt.number}`}>
        <header>
          <div><b className="dm-receipt-brand">DEALMAKER</b><small>Artist Management</small></div>
          <div className="dm-receipt-title"><h2>INVOICE</h2><span>{receipt.number}</span></div>
        </header>
        <div className="dm-receipt-stamp">{paid ? <PaidStamp /> : <span className="dm-receipt-unpaid" role="status">UNPAID</span>}</div>
        <dl className="dm-receipt-meta">
          <div><dt>Bill to</dt><dd>{receipt.billTo}</dd>{receipt.billEmail && <dd className="muted">{receipt.billEmail}</dd>}{receipt.artist && <dd className="muted">Artist: {receipt.artist}</dd>}</div>
          <div><dt>Issued</dt><dd>{receiptDate(receipt.issued)}</dd></div>
          {receipt.paidAt && <div><dt>Paid on</dt><dd>{receiptDate(receipt.paidAt)}</dd></div>}
        </dl>
        <table>
          <thead><tr><th scope="col">Description</th><th scope="col">Amount</th></tr></thead>
          <tbody>{receipt.lines.map((line) => <tr key={line.label}><td><b>{line.label}</b>{line.detail && <small>{line.detail}</small>}</td><td>{aed(line.amount)}</td></tr>)}</tbody>
        </table>
        <dl className="dm-receipt-totals">
          <dt>Subtotal</dt><dd>{aed(receipt.subtotal)}</dd>
          <dt>VAT 5%</dt><dd>{aed(receipt.vat)}</dd>
          <dt className="total">{paid ? "Total paid" : "Total due now"}</dt><dd className="total">{aed(receipt.total)}</dd>
        </dl>
        {receipt.later.length > 0 && (
          <section className="dm-receipt-later">
            <h3>Billed separately, not in this total</h3>
            {receipt.later.map((line) => <div key={line.label}><p><b>{line.label}</b>{line.detail && <small>{line.detail}</small>}</p><span>{aed(line.amount)}</span></div>)}
          </section>
        )}
        <footer>Prices in AED, including 5% VAT. Sandbox payment: no real money is charged.</footer>
      </article>
      <Button type="button" variant="outline" className="dm-receipt-download" disabled={busy} onClick={download}><Download className="me-2 h-4 w-4" />{t("Download invoice (PDF)")}</Button>
    </div>
  );
}
