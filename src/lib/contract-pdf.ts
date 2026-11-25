/** A booking contract as an A4 PDF. Text is drawn on canvases, so names in any script come out correctly. */
import type { ContractDoc } from "@/components/dashboard/ContractPreview";

export type ContractLine = { text: string; size: number; bold?: boolean; gap?: number; color?: string };

/** The contract as a flat list of paragraphs, in reading order. */
export function contractLines(doc: ContractDoc, t: (s: string) => string): ContractLine[] {
  const out: ContractLine[] = [
    { text: "DEALMAKER", size: 54, bold: true }, { text: t("Artist Management").toUpperCase(), size: 20, bold: true, color: "#7a7062", gap: 26 },
    { text: t("CONTRACT"), size: 40, bold: true }, { text: `${t("Contract number")}: ${doc.number}`, size: 24 }, { text: `${t("Template")}: ${doc.templateName}`, size: 24 },
    { text: `${doc.stamp.word} · ${doc.stamp.sub}`, size: 24, bold: true, color: doc.stamp.tone === "accepted" ? "#2f7a45" : "#b07a1f", gap: 30 },
  ];
  if (doc.intro) out.push({ text: doc.intro, size: 24, gap: 20 });
  for (const [label, value] of doc.parties ?? []) out.push({ text: `${t(label)}: ${value || "—"}`, size: 24 });
  if (doc.jobDetail) out.push({ text: doc.jobDetail, size: 24, gap: 20 });
  doc.clauses.forEach((clause, i) => {
    out.push({ text: `${t("Article")} ${i + 1}${clause.title ? `  ${clause.title}` : ""}`, size: 26, bold: true, gap: 4 });
    for (const paragraph of clause.body.split(/\n\s*\n/)) out.push({ text: paragraph, size: 23, gap: 14 });
  });
  if (doc.rider) { out.push({ text: t("Schedule C: technical and hospitality rider"), size: 26, bold: true }); for (const line of doc.rider.split("\n")) out.push({ text: line, size: 23 }); }
  if (doc.footer) out.push({ text: doc.footer, size: 21, color: "#7a7062", gap: 10 });
  return out;
}

/** Wraps to the page width; a single word wider than the page is split. */
export function wrapText(text: string, width: number, measure: (s: string) => number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      while (measure(word) > width && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && measure(word.slice(0, cut)) > width) cut--;
        if (line) { lines.push(line); line = ""; }
        lines.push(word.slice(0, cut)); word = word.slice(cut);
      }
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > width) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** Several JPEG pages as one PDF. */
export function jpegPagesToPdf(pages: Uint8Array[], width: number, height: number) {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: string | Uint8Array) => { const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk; parts.push(bytes); length += bytes.length; };
  const object = (body: Array<string | Uint8Array>) => { offsets.push(length); push(`${offsets.length} 0 obj\n`); body.forEach(push); push("\nendobj\n"); };
  const content = "q 595 0 0 842 0 0 cm /Im0 Do Q";
  push("%PDF-1.4\n");
  object(["<< /Type /Catalog /Pages 2 0 R >>"]);
  object([`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] /Count ${pages.length} >>`]);
  pages.forEach((jpeg, i) => {
    const base = 3 + i * 3;
    object([`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${base + 1} 0 R >> >> /Contents ${base + 2} 0 R >>`]);
    object([`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream"]);
    object([`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
  });
  const xref = length;
  push(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const pdf = new Uint8Array(length);
  let at = 0;
  for (const part of parts) { pdf.set(part, at); at += part.length; }
  return pdf;
}

const W = 1240, H = 1754, M = 100;
export function contractPdf(doc: ContractDoc, t: (s: string) => string) {
  const pages: HTMLCanvasElement[] = [];
  let c: CanvasRenderingContext2D, y = 0;
  const page = () => {
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot create the contract file.");
    c = context; pages.push(canvas); y = M + 40;
    c.fillStyle = "#fbf7ef"; c.fillRect(0, 0, W, H); c.fillStyle = "#d4842a"; c.fillRect(0, 0, W, 14);
  };
  page();
  for (const line of contractLines(doc, t)) {
    const font = `${line.bold ? "700" : "400"} ${line.size}px Manrope, Arial, sans-serif`;
    c!.font = font;
    for (const text of wrapText(line.text, W - M * 2, (s) => c.measureText(s).width)) {
      if (y > H - M - 40) page();
      c!.font = font; c!.fillStyle = line.color ?? "#1a1712"; c!.fillText(text, M, y);
      y += Math.round(line.size * 1.45);
    }
    y += line.gap ?? 6;
  }
  const bytes = pages.map((canvas, i) => {
    const context = canvas.getContext("2d")!;
    context.font = "400 20px Manrope, Arial, sans-serif"; context.fillStyle = "#7a7062";
    context.fillText(`${doc.number} · ${t("Page")} ${i + 1} ${t("of")} ${pages.length}`, M, H - 60);
    const base64 = canvas.toDataURL("image/jpeg", 0.92).split(",")[1] ?? "";
    return Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  });
  return jpegPagesToPdf(bytes, W, H);
}

export function downloadContract(doc: ContractDoc, t: (s: string) => string) {
  const url = URL.createObjectURL(new Blob([contractPdf(doc, t) as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url; link.download = `contract-${doc.number}.pdf`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
