import type { Receipt } from "./receipt";

/** Wraps one JPEG into a single A4 page PDF. Pure, so it can be tested without a browser. */
export function jpegToPdf(jpeg: Uint8Array, width: number, height: number) {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: string | Uint8Array) => { const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk; parts.push(bytes); length += bytes.length; };
  const object = (body: Array<string | Uint8Array>) => { offsets.push(length); push(`${offsets.length} 0 obj\n`); body.forEach(push); push("\nendobj\n"); };
  const content = "q 595 0 0 842 0 0 cm /Im0 Do Q";
  push("%PDF-1.4\n");
  object(["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  object(["<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>"]);
  object([`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream"]);
  object([`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
  const xref = length;
  push(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const pdf = new Uint8Array(length);
  let at = 0;
  for (const part of parts) { pdf.set(part, at); at += part.length; }
  return pdf;
}

const aed = (value: number) => `AED ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const receiptDate = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dubai" });

const W = 1240, H = 1754, M = 96;
/** Draws the invoice on a canvas, so names in any script come out correctly, and returns it as a PDF. */
export function receiptPdf(receipt: Receipt) {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("This browser cannot create the invoice file.");
  const text = (value: string, x: number, y: number, size: number, options: { bold?: boolean; color?: string; align?: CanvasTextAlign; max?: number } = {}) => {
    c.font = `${options.bold ? "700" : "400"} ${size}px Manrope, Arial, sans-serif`;
    c.fillStyle = options.color ?? "#1a1712"; c.textAlign = options.align ?? "left";
    c.fillText(value, x, y, options.max);
  };
  /** Word wrap; returns the y below the last line. */
  const paragraph = (value: string, x: number, y: number, size: number, max: number, color: string) => {
    c.font = `400 ${size}px Manrope, Arial, sans-serif`;
    let line = "";
    for (const word of value.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (c.measureText(next).width > max && line) { text(line, x, y, size, { color }); y += size * 1.45; line = word; } else line = next;
    }
    if (line) { text(line, x, y, size, { color }); y += size * 1.45; }
    return y;
  };
  const rule = (y: number, color = "#e7dcc6", thickness = 2) => { c.fillStyle = color; c.fillRect(M, y, W - M * 2, thickness); };
  c.fillStyle = "#fbf7ef"; c.fillRect(0, 0, W, H);
  const band = c.createLinearGradient(0, 0, W, 0); band.addColorStop(0, "#f0c062"); band.addColorStop(1, "#d4842a");
  c.fillStyle = band; c.fillRect(0, 0, W, 14);
  text("DEALMAKER", M, 150, 64, { bold: true });
  text("ARTIST MANAGEMENT", M, 188, 22, { color: "#7a7062", bold: true });
  text("INVOICE", W - M, 150, 64, { bold: true, align: "right" });
  text(receipt.number, W - M, 190, 24, { color: "#7a7062", align: "right" });
  const paid = receipt.status === "paid";
  c.save(); c.translate(W - M - 150, 270); c.rotate(-0.12);
  c.strokeStyle = paid ? "#2f7a45" : "#b4302a"; c.lineWidth = 7; c.strokeRect(-140, -48, 280, 96);
  text(paid ? "PAID" : "UNPAID", 0, 20, 56, { bold: true, color: paid ? "#2f7a45" : "#b4302a", align: "center" });
  c.restore();
  rule(350);
  text("BILL TO", M, 400, 20, { bold: true, color: "#7a7062" });
  text(receipt.billTo, M, 440, 30, { bold: true, max: 560 });
  if (receipt.billEmail) text(receipt.billEmail, M, 476, 22, { color: "#7a7062", max: 560 });
  text("ISSUED", 720, 400, 20, { bold: true, color: "#7a7062" });
  text(receiptDate(receipt.issued), 720, 440, 28, { bold: true });
  if (receipt.paidAt) { text("PAID ON", 720, 490, 20, { bold: true, color: "#7a7062" }); text(receiptDate(receipt.paidAt), 720, 528, 28, { bold: true }); }
  if (receipt.artist) text(`Artist: ${receipt.artist}`, M, 524, 24, { max: 560 });
  rule(570);
  text("DESCRIPTION", M, 630, 20, { bold: true, color: "#7a7062" });
  text("AMOUNT", W - M, 630, 20, { bold: true, color: "#7a7062", align: "right" });
  rule(652, "#1a1712", 3);
  let y = 712;
  for (const line of receipt.lines) {
    text(line.label, M, y, 30, { bold: true, max: 760 });
    text(aed(line.amount), W - M, y, 30, { align: "right" });
    y = line.detail ? paragraph(line.detail, M, y + 40, 22, 760, "#7a7062") : y + 32;
    rule(y); y += 60;
  }
  for (const [label, value] of [["Subtotal", receipt.subtotal], ["VAT 5%", receipt.vat]] as const) {
    text(label, 740, y, 28, { color: "#7a7062" }); text(aed(value), W - M, y, 28, { align: "right" }); y += 48;
  }
  c.fillStyle = "#1a1712"; c.fillRect(740, y - 16, W - M - 740, 3); y += 48;
  text(paid ? "TOTAL PAID" : "TOTAL DUE NOW", 740, y, 30, { bold: true }); text(aed(receipt.total), W - M, y, 40, { bold: true, align: "right" });
  y += 110;
  if (receipt.later.length) {
    text("BILLED SEPARATELY (NOT IN THIS TOTAL)", M, y, 20, { bold: true, color: "#b07a1f" }); y += 52;
    for (const line of receipt.later) {
      text(line.label, M, y, 28, { bold: true, max: 760 }); text(aed(line.amount), W - M, y, 28, { align: "right" });
      y = line.detail ? paragraph(line.detail, M, y + 38, 22, 900, "#7a7062") : y + 40;
    }
  }
  rule(H - 130);
  text("Prices in AED, including 5% VAT. Sandbox payment: no real money is charged.", M, H - 80, 22, { color: "#7a7062" });
  const base64 = canvas.toDataURL("image/jpeg", 0.94).split(",")[1] ?? "";
  const jpeg = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return jpegToPdf(jpeg, W, H);
}

export function downloadReceipt(receipt: Receipt) {
  const url = URL.createObjectURL(new Blob([receiptPdf(receipt)], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url; link.download = `invoice-${receipt.number}.pdf`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
