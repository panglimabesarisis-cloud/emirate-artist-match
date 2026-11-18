/** Formats the first "Book Artist" chat message sent on behalf of the client. */
export type BookingMessageInput = {
  name: string; artistName: string; eventDate: string | null; startTime: string | null; endTime: string | null;
  performMinutes: number | null; guests: number | null; budget: number | null;
  packages: { title: string; price: number }[]; note: string | null;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const num = (n: number) => Math.round(n).toLocaleString("en-US");

export function formatEventDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

export function formatBookingMessage(i: BookingMessageInput): string {
  const details = [
    `Artist: ${i.artistName}`,
    i.eventDate && `Event Date: ${formatEventDate(i.eventDate)}`,
    (i.startTime || i.endTime) && `Time: ${i.startTime ?? "?"} - ${i.endTime ?? "?"}`,
    i.performMinutes && `Performance Duration: ${i.performMinutes} Minutes`,
    i.guests && `Guest : ${num(i.guests)} People`,
    i.budget && `Budget: AED ${num(i.budget)}`,
  ].filter(Boolean);
  const parts = [`Hi i'm ${i.name}\nwant to book :`, details.join("\n")];
  if (i.packages.length) parts.push(`Packages: ${i.packages.map((p) => p.title).join(", ")}\n${num(i.packages.reduce((s, p) => s + p.price, 0))}`);
  if (i.note) parts.push(i.note);
  return parts.join("\n---\n") + "\n---\nPlease Check Schedule";
}
