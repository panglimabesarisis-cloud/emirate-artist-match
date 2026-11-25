/** Single words the dashboard headings colour in two halves, like "Wal|let". */
const HALVES: Record<string, [string, string]> = { Overview: ["Over", "view"], Ratecards: ["Rate", "cards"], Invoices: ["Invo", "ices"], Contracts: ["Contr", "acts"], Settings: ["Set", "tings"] };

/** A heading in the dashboard style: the last word, or the second half, in gold. */
export function Accent({ text }: { text: string }) {
  const halves = HALVES[text];
  if (halves) return <>{halves[0]}<span className="it">{halves[1]}</span></>;
  const at = text.lastIndexOf(" ");
  return at < 0 ? <span className="it">{text}</span> : <>{text.slice(0, at)} <span className="it">{text.slice(at + 1)}</span></>;
}
