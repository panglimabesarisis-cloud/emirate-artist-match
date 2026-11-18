export type IcsEvent = { uid: string; date: string; title: string; description?: string };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (d: string) => d.replace(/-/g, "");
function nextDay(d: string) {
  const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
// RFC 5545: lines longer than 75 octets are folded.
function fold(line: string) {
  const out: string[] = [];
  while (line.length > 74) { out.push(line.slice(0, 74)); line = " " + line.slice(74); }
  out.push(line);
  return out.join("\r\n");
}

/** All-day events (UAE bookings are per event date). */
export function buildIcs(calName: string, events: IcsEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dealmaker//Bookings//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(calName)}`, "X-WR-TIMEZONE:Asia/Dubai"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@dealmaker`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(e.date))}`, `SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
