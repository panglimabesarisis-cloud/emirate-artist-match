/** Names for the Google Drive invoice archive: Artist folder / Year / "MM-Month", file ArtistName-InvoiceNo-Client-Date-Amount.pdf */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** One filename part: no spaces or symbols, letters of any language are kept. */
export function namePart(value: string | null | undefined, fallback = "Unknown"): string {
  const s = (value ?? "").normalize("NFC").replace(/\s+/g, "").replace(/[^\p{L}\p{N}_.-]/gu, "").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 40);
  return s || fallback;
}

/** Folder names may keep spaces but not slashes or control characters. */
export function folderName(value: string | null | undefined, fallback = "Unknown artist"): string {
  const s = (value ?? "").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return s || fallback;
}

/** [artist folder, year, "11-November"] from the invoice issue date (YYYY-MM-DD, Dubai date). */
export function archiveFolders(artistName: string, issued: string): [string, string, string] {
  const [y = "0000", m = "01"] = issued.slice(0, 10).split("-");
  const month = Math.min(12, Math.max(1, Number(m)));
  return [folderName(artistName), y, `${String(month).padStart(2, "0")}-${MONTHS[month - 1]}`];
}

export function archiveFileName(i: { artistName: string; number: string; client: string; issued: string; total: number; paid?: boolean }): string {
  return `${[namePart(i.artistName), namePart(i.number), namePart(i.client), i.issued.slice(0, 10), i.total.toFixed(2)].join("-")}${i.paid ? "-PAID" : ""}.pdf`;
}

/** The Dubai calendar date of an instant, as YYYY-MM-DD. */
export function dubaiDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
