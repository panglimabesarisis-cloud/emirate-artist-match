/**
 * Builds the invoice PDF for the Drive archive without any dependency (runs on the server runtime).
 * Layout follows the cream invoice sheet from the dashboard. Text uses the built-in Helvetica fonts, so only
 * Latin text is drawn; other characters print as "?" (the Drive file name keeps the original letters).
 */

export type ArchiveInvoice = {
  number: string;
  artistName: string;
  client: string;
  clientEmail?: string | null;
  issued: string; // YYYY-MM-DD
  due: string | null;
  items: { title: string; qty: number; price: number }[];
  subtotal: number;
  vat: number;
  total: number;
  paid: number;
  paidAt?: string | null;
  status: "unpaid" | "partial" | "paid" | "expired" | "none";
  notes?: string | null;
  trn?: string | null;
};

const W = 595, H = 842, M = 48;
type Color = [number, number, number];
const INK: Color = [0.1, 0.09, 0.07], MUTED: Color = [0.48, 0.44, 0.38], LINE: Color = [0.91, 0.86, 0.78], GOLD: Color = [0.69, 0.48, 0.12];
const RED: Color = [0.71, 0.19, 0.16], GREEN: Color = [0.18, 0.48, 0.27], CREAM: Color = [0.984, 0.969, 0.937], NOTE: Color = [0.953, 0.922, 0.859];

// Helvetica / Helvetica-Bold advance widths for ASCII 32..126 (1/1000 em).
const REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

/** Printable Latin-1 only; everything else becomes "?". */
const clean = (s: string) => Array.from(s.normalize("NFC")).map((ch) => { const c = ch.codePointAt(0) ?? 63; return c >= 32 && c <= 126 || c >= 160 && c <= 255 ? ch : "?"; }).join("");
const width = (s: string, size: number, bold: boolean) => (clean(s).split("").reduce((n, ch) => { const c = ch.charCodeAt(0); return n + (c >= 32 && c <= 126 ? (bold ? BOLD : REG)[c - 32]! : 556); }, 0) * size) / 1000;
const esc = (s: string) => clean(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const col = (c: Color) => c.map((v) => v.toFixed(3)).join(" ");
const n2 = (v: number) => v.toFixed(2);

export const money = (v: number) => `AED ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dmy = (d: string | null | undefined, long = false) => (d ? new Date(d.length === 10 ? `${d}T00:00:00Z` : d).toLocaleDateString("en-GB", { day: "numeric", month: long ? "long" : "short", year: "numeric", timeZone: "UTC" }) : "Not set");

/** Wraps text to a width; always returns at least one line. */
export function wrap(text: string, max: number, size: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of clean(text).split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (width(next, size, bold) <= max) { line = next; continue; }
      if (line) out.push(line);
      line = word;
      while (width(line, size, bold) > max && line.length > 1) { let k = line.length - 1; while (k > 1 && width(line.slice(0, k), size, bold) > max) k--; out.push(line.slice(0, k)); line = line.slice(k); }
    }
    out.push(line);
  }
  return out.length ? out : [""];
}

class Page {
  ops: string[] = [];
  rect(x: number, y: number, w: number, h: number, fill: Color) { this.ops.push(`${col(fill)} rg ${n2(x)} ${n2(H - y - h)} ${n2(w)} ${n2(h)} re f`); }
  line(x1: number, y1: number, x2: number, y2: number, c: Color, wd = 0.6) { this.ops.push(`${col(c)} RG ${wd} w ${n2(x1)} ${n2(H - y1)} m ${n2(x2)} ${n2(H - y2)} l S`); }
  text(s: string, x: number, y: number, size: number, c: Color, o: { bold?: boolean; align?: "l" | "r" | "c" } = {}) {
    const w = width(s, size, !!o.bold);
    const tx = o.align === "r" ? x - w : o.align === "c" ? x - w / 2 : x;
    this.ops.push(`BT /${o.bold ? "F2" : "F1"} ${size} Tf ${col(c)} rg ${n2(tx)} ${n2(H - y)} Td (${esc(s)}) Tj ET`);
  }
  /** Double-bordered stamp, rotated about its centre. */
  stamp(cx: number, cy: number, word: string, sub: string, c: Color) {
    const w = Math.max(width(word, 15, true), width(sub, 7.5, true)) + 28, h = 38, a = (-4 * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    this.ops.push(`q ${n2(cos)} ${n2(sin)} ${n2(-sin)} ${n2(cos)} ${n2(cx)} ${n2(H - cy)} cm ${col(c)} RG 2.2 w ${n2(-w / 2)} ${n2(-h / 2)} ${n2(w)} ${n2(h)} re S 0.7 w ${n2(-w / 2 + 3.5)} ${n2(-h / 2 + 3.5)} ${n2(w - 7)} ${n2(h - 7)} re S`);
    this.ops.push(`BT /F2 15 Tf ${col(c)} rg ${n2(-width(word, 15, true) / 2)} 3 Td (${esc(word)}) Tj ET BT /F2 7.5 Tf ${col(c)} rg ${n2(-width(sub, 7.5, true) / 2)} -10 Td (${esc(sub)}) Tj ET Q`);
  }
}

/** One A4 page per 12 item rows; the last page carries totals, signatures, notes and footer. */
export function buildInvoicePdf(d: ArchiveInvoice): Uint8Array {
  const pages: Page[] = [];
  const fresh = () => { const p = new Page(); p.rect(0, 0, W, H, CREAM); p.rect(0, 0, W, 5, [0.9, 0.67, 0.25]); pages.push(p); return p; };
  let p = fresh();
  const balance = Math.max(0, d.total - Math.min(d.total, d.paid));
  const stampColor = d.status === "paid" ? GREEN : d.status === "partial" ? GOLD : d.status === "expired" ? MUTED : RED;
  const word = d.status === "paid" ? "PAID" : d.status === "partial" ? "PARTIALLY PAID" : d.status === "expired" ? "EXPIRED" : "UNPAID";
  const sub = d.status === "paid" ? `PAID ${dmy(d.paidAt ?? d.issued).toUpperCase()}` : d.status === "expired" ? "NO LONGER PAYABLE" : `BALANCE ${money(balance).toUpperCase()}`;
  const settles = d.status !== "expired" && d.status !== "none";

  p.text("DEALMAKER", M, 84, 26, [0.07, 0.07, 0.07], { bold: true });
  p.text("ARTIST MANAGEMENT", M, 100, 7.5, MUTED, { bold: true });
  p.text("Artist name:", M, 126, 8.5, MUTED); p.text(d.artistName || "-", M + 72, 126, 8.5, INK, { bold: true });
  p.text("Invoice number:", M, 140, 8.5, MUTED); p.text(d.number, M + 72, 140, 8.5, INK, { bold: true });
  p.text("INVOICE", W - M, 84, 30, INK, { bold: true, align: "r" });
  if (d.status !== "none") p.stamp(W - M - 70, 122, word, sub, stampColor);

  p.line(M, 166, W - M, 166, LINE);
  const cols = [M, M + 215, M + 365];
  p.text("BILL TO", cols[0]!, 186, 7, MUTED, { bold: true }); p.text("ISSUED", cols[1]!, 186, 7, MUTED, { bold: true }); p.text("INVOICE DUE DATE", cols[2]!, 186, 7, MUTED, { bold: true });
  p.text(d.client || "-", cols[0]!, 202, 10.5, INK, { bold: true }); p.text(dmy(d.issued), cols[1]!, 202, 10.5, INK, { bold: true }); p.text(dmy(d.due), cols[2]!, 202, 10.5, INK, { bold: true });
  p.text(d.client ? d.clientEmail || "Email not on file" : "", cols[0]!, 215, 8, MUTED); p.text("Currency AED", cols[1]!, 215, 8, MUTED); p.text(settles ? `Balance due ${money(balance)}` : "", cols[2]!, 215, 8, MUTED);
  p.line(M, 228, W - M, 228, LINE);

  const header = (pg: Page, y: number) => {
    pg.text("#", M, y, 7, MUTED, { bold: true }); pg.text("DESCRIPTION", M + 26, y, 7, MUTED, { bold: true });
    pg.text("QTY", W - M - 215, y, 7, MUTED, { bold: true, align: "r" }); pg.text("UNIT PRICE", W - M - 100, y, 7, MUTED, { bold: true, align: "r" }); pg.text("AMOUNT", W - M, y, 7, MUTED, { bold: true, align: "r" });
    pg.line(M, y + 7, W - M, y + 7, INK, 0.9);
  };
  let y = 250;
  header(p, y); y += 24;
  d.items.forEach((it, i) => {
    const lines = wrap(it.title || "Untitled item", 270, 10, true);
    const need = lines.length * 13 + 14;
    if (y + need > H - 150) { p = fresh(); y = 70; header(p, y); y += 24; }
    p.text(String(i + 1).padStart(2, "0"), M, y, 9, MUTED);
    lines.forEach((l, k) => p.text(l, M + 26, y + k * 13, 10, INK, { bold: true }));
    p.text(String(it.qty), W - M - 215, y, 10, INK, { align: "r" }); p.text(money(it.price), W - M - 100, y, 10, INK, { align: "r" }); p.text(money(it.qty * it.price), W - M, y, 10, INK, { align: "r" });
    y += need - 4; p.line(M, y - 9, W - M, y - 9, LINE); y += 8;
  });
  if (d.items.length === 0) { p.text("No items", M + 26, y, 10, MUTED); y += 24; }

  const notes = d.notes ? wrap(d.notes, W - 2 * M - 28, 9) : [];
  const blockH = 130 + (notes.length ? notes.length * 12 + 40 : 0);
  if (y + blockH > H - 60) { p = fresh(); y = 80; }
  y += 8;
  const rows: [string, string, boolean?][] = [["Subtotal", money(d.subtotal)], ["VAT 5%", money(d.vat)]];
  const lx = W - M - 215, rx = W - M;
  rows.forEach(([a, b]) => { p.text(a, lx, y, 10, MUTED); p.text(b, rx, y, 10, INK, { align: "r" }); y += 17; });
  p.line(lx, y - 8, rx, y - 8, INK, 1);
  p.text("TOTAL", lx, y + 9, 13, INK, { bold: true }); p.text(money(d.total), rx, y + 9, 18, INK, { bold: true, align: "r" }); y += 30;
  if (settles) {
    p.text("Paid", lx, y, 10, MUTED); p.text(money(Math.min(d.total, d.paid)), rx, y, 10, INK, { align: "r" }); y += 17;
    p.text("Balance due", lx, y, 10, MUTED); p.text(money(balance), rx, y, 10, balance > 0 ? RED : GREEN, { bold: true, align: "r" });
  }
  y += 36;

  const sy = Math.max(y, H - 230 - (notes.length ? notes.length * 12 + 40 : 0));
  p.text(`Dubai, ${dmy(d.issued, true)}`, W - M, sy - 12, 9, MUTED, { align: "r" });
  p.line(M, sy + 20, M + 190, sy + 20, INK, 0.8); p.line(W - M - 190, sy + 20, W - M, sy + 20, INK, 0.8);
  p.text(`( ${d.client || "Client name"} )`, M, sy + 36, 10, INK, { bold: true }); p.text(`( ${d.artistName || "-"} )`, W - M, sy + 36, 10, INK, { bold: true, align: "r" });
  p.text("Client of Dealmaker", M, sy + 49, 8, MUTED); p.text("Artist of Dealmaker Management", W - M, sy + 49, 8, MUTED, { align: "r" });
  let ny = sy + 66;
  if (notes.length) {
    p.rect(M, ny - 10, W - 2 * M, notes.length * 12 + 26, NOTE);
    p.text("NOTES", M + 14, ny + 4, 7, GOLD, { bold: true });
    notes.forEach((l, k) => p.text(l, M + 14, ny + 18 + k * 12, 9, [0.3, 0.27, 0.23]));
    ny += notes.length * 12 + 36;
  }
  p.line(M, H - 54, W - M, H - 54, LINE, 0.5);
  p.text(d.trn ? `TRN ${d.trn}` : "TRN not added yet", M, H - 40, 8, MUTED);
  p.text("Paid through Dealmaker. Held until the job is completed.", W - M, H - 40, 8, MUTED, { align: "r" });
  void ny;

  // Assemble the PDF file.
  const objs: string[] = [];
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ");
  objs.push("<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  pages.forEach((pg, i) => {
    const content = pg.ops.join("\n");
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
