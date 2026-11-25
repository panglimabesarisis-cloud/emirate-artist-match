import { Download, Printer, X } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import "@/components/dashboard/invoice-print.css";
import "./a4.css";

/** The popup every admin "View" opens: an A4 sheet with Print and, where a file can be built, Download. */
export function A4Dialog({ title, onClose, onDownload, children, below }: { title: string; onClose: () => void; onDownload?: (() => void) | undefined; children: ReactNode; /** Screen-only details under the sheet; never printed. */ below?: ReactNode }) {
  const print = () => {
    document.body.classList.add("inv-printing");
    const done = () => { document.body.classList.remove("inv-printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.setTimeout(() => window.print(), 50);
  };
  const download = () => { try { onDownload?.(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create the file"); } };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent data-ivp-print="true" className="a4-dialog max-h-[calc(100dvh-32px)] w-[min(860px,calc(100vw-20px))] max-w-none gap-0 overflow-y-auto p-0 [&>button.absolute]:hidden">
        <div className="ivp-bar a4-bar">
          <DialogTitle className="font-display text-[26px] font-normal leading-none">{title}</DialogTitle>
          <div className="flex flex-wrap gap-2">
            {onDownload && <Button type="button" variant="outline" className="rounded-full" onClick={download}><Download className="me-2 h-4 w-4" />Download PDF</Button>}
            <Button type="button" variant="outline" className="rounded-full" onClick={print}><Printer className="me-2 h-4 w-4" />Print / PDF</Button>
            <DialogClose asChild><Button type="button" variant="outline" size="icon" aria-label="Close document"><X className="h-4 w-4" /></Button></DialogClose>
          </div>
        </div>
        <DialogDescription className="sr-only">A4 document preview</DialogDescription>
        <div className="ivp-sheet min-w-0 p-3 sm:p-6">{children}</div>
        {below && <div data-noprint className="border-t p-4 sm:p-6">{below}</div>}
      </DialogContent>
    </Dialog>
  );
}

export type SheetRow = { label: string; detail?: string | undefined; amount: string };

/** An A4 sheet for documents that are not booking invoices: platform receipts and payout statements. */
export function A4Statement({ heading, number, status, tone, parties, rows, totals, note }: {
  heading: string; number: string; status: string; tone: "paid" | "unpaid" | "partial"; parties: [label: string, lines: (string | null | undefined)[]][]; rows: SheetRow[]; totals: [label: string, amount: string][]; note?: string | undefined;
}) {
  return (
    <article data-paper data-testid="a4-statement" dir="ltr" className="a4-sheet">
      <header><div><b className="a4-brand">DEALMAKER</b><small>Artist Management</small></div><div className="a4-head-right"><h2>{heading}</h2><span>{number}</span><em className={`a4-stamp is-${tone}`}>{status}</em></div></header>
      <div className="a4-parties">{parties.map(([label, lines]) => <section key={label}><h3>{label}</h3>{lines.filter(Boolean).map((line, i) => <p key={i} className={i ? "muted" : "strong"}>{line}</p>)}</section>)}</div>
      <table><thead><tr><th scope="col">Description</th><th scope="col">Amount</th></tr></thead><tbody>{rows.map((row) => <tr key={row.label}><td><b>{row.label}</b>{row.detail && <small>{row.detail}</small>}</td><td>{row.amount}</td></tr>)}</tbody></table>
      <dl className="a4-totals">{totals.map(([label, amount], i) => <div key={label} className={i === totals.length - 1 ? "grand" : undefined}><dt>{label}</dt><dd>{amount}</dd></div>)}</dl>
      <footer>{note && <p>{note}</p>}<p>Prices in AED. Sandbox payment: no real money is charged.</p></footer>
    </article>
  );
}
