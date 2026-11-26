import { useState } from "react";
import { BedDouble, CalendarCheck, ChevronDown, Coins, Crown, Hospital, Inbox, Plane, Receipt, Search, Telescope, Wallet, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** "fill" puts a form in the message box, "ask" sends the request, "open" goes somewhere. */
export type Command = { label: string } & ({ fill: string } | { ask: string } | { open: "topup" | "plans" });
type Group = { label: string; icon: LucideIcon } & ({ command: Command } | { items: Command[] });

const today = () => new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
const form = (title: string, fields: string[]) => `${title}\nDate: ${today()}\n${fields.map((f) => `${f}: `).join("\n")}`;
const report = (what: string, source: string, extra = "") => `${what} Use build_report with source ${source}${extra}.`;

export const COMMANDS: () => Group[] = () => [
  { label: "Deep Search", icon: Telescope, command: { label: "Deep Search", fill: "/deepsearch " } },
  { label: "Find Flight", icon: Plane, command: { label: "Find Flight", fill: form("Find Flight", ["From", "To", "Departure Date", "Return Date", "Specific Time", "Direct or Non Direct"]) } },
  { label: "Find Hotel", icon: BedDouble, command: { label: "Find Hotel", fill: form("Find Hotel", ["City", "Country", "Check-In Date", "Check-Out Date", "Guest", "Type (Villa / Hotel / Apartment / Guest House)"]) } },
  { label: "Find Hospital", icon: Hospital, command: { label: "Find Hospital", fill: form("Find Hospital", ["City", "Country", "Doctor Speciality", "Doctor Gender", "Date To Visit"]) } },
  { label: "Research", icon: Search, command: { label: "Research", fill: "Research (deep search, short news summary in a table with links)\nTopic: \nCountry or city: \nPeriod: " } },
  { label: "My Booking", icon: CalendarCheck, items: [
    { label: "Incoming Booking", ask: "Show my incoming bookings (new, not yet confirmed) in a table." },
    { label: "Completed Booking", ask: "Show my completed bookings in a table." },
    { label: "On Progress Booking", ask: "Show my bookings that are still being negotiated in a table." },
  ] },
  { label: "Invoice", icon: Receipt, items: [
    { label: "Send Invoice", fill: "Send Invoice\nClient: \nItem: \nQty: \nPrice (AED): \nDue date: \nNotes: " },
    { label: "Unpaid Invoice", ask: "Show my unpaid invoices in a table." },
    { label: "Paid Invoice", ask: "Show my paid invoices in a table." },
  ] },
  { label: "Revenue", icon: Wallet, items: [
    { label: "Earning", ask: report("Show my earnings per month as an area line chart and a table.", "invoices", ", metric paid, groupBy month, chart area") },
    { label: "Wallet Balance", ask: "Show my wallet balance and how it is calculated, in a table." },
    { label: "Escrow", ask: "Show the money held in escrow, per booking, in a table." },
    { label: "Withdraw", ask: "Show how much I can withdraw and my withdrawal requests in a table." },
    { label: "Deposit", ask: report("Show my deposits and payments in a table.", "payments", ", metric total, groupBy records") },
  ] },
  { label: "Subscribe", icon: Crown, items: [
    { label: "Your Subscribe", ask: "Show my current subscription, its features and limits in a table." },
    { label: "Upgrade Subscribe", open: "plans" },
  ] },
  { label: "AI Credit", icon: Coins, items: [
    { label: "Your Credit", ask: "How many AI credits do I have left?" },
    { label: "Usage Credit", ask: report("Show my AI credit usage as a data table.", "credits", ", metric total, groupBy records") },
    { label: "Top Up Credit", open: "topup" },
  ] },
  { label: "Inbox", icon: Inbox, items: [
    { label: "Incoming Message AI", ask: report("Show incoming messages handled by AI as a bar chart per month, then a detailed table.", "chats", ", metric count: first groupBy month with chart bar, then groupBy records with chart none") },
    { label: "Incoming Form", ask: report("Show incoming forms as a doughnut chart by status, then a detailed table.", "forms", ", metric count: first groupBy status with chart doughnut, then groupBy records with chart none") },
  ] },
];

const row = "flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-start text-sm transition-colors hover:border-gold/50 hover:bg-gold/10 disabled:pointer-events-none disabled:opacity-40";

/** The command menu of the Personal AI Agent; grouped commands open and close in place. */
export function CommandMenu({ busy, onRun }: { busy: boolean; onRun: (command: Command) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      {COMMANDS().map((group) => {
        const Icon = group.icon;
        const items = "items" in group ? group.items : null;
        const expanded = open === group.label;
        return (
          <div key={group.label}>
            <button type="button" disabled={busy} className={row} {...(items ? { "aria-expanded": expanded } : {})}
              onClick={() => ("command" in group ? onRun(group.command) : setOpen(expanded ? null : group.label))}>
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold/15 text-gold"><Icon className="h-3.5 w-3.5" aria-hidden /></span>
              <span className="flex-1">{t(group.label)}</span>
              {items && <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />}
            </button>
            {items && expanded && (
              <div className="ms-5 mt-1.5 space-y-1.5 border-s border-border ps-3">
                {items.map((item) => <button key={item.label} type="button" disabled={busy} className={row} onClick={() => onRun(item)}>{t(item.label)}</button>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
