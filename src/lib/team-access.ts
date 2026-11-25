/**
 * Pages an artist can give a team member. Every id here must have a tab in the member workspace.
 * Wallet, export, verification, account and team are never grantable (database check on team_roles).
 */
export const TEAM_PAGES = [
  { id: "inbox", label: "Inbox" },
  { id: "quotes", label: "Quote requests" },
  { id: "bookings", label: "Bookings" },
  { id: "calendar", label: "Calendar" },
  { id: "invoices", label: "Invoice" },
  { id: "contracts", label: "Contract" },
  { id: "media", label: "Photos & videos" },
] as const;
export type TeamPage = (typeof TEAM_PAGES)[number]["id"];
/** The rest of the artist's menu. Listed so the owner sees the whole picture; never grantable. */
export const OWNER_ONLY_PAGES = ["Overview", "Your AI agent", "Open inquiries", "Wallet", "AI credits", "Export data", "Profile", "Ratecard", "Order form", "Verification", "AI agent", "AI flow", "Team", "Support center"] as const;

/** Known pages only, in menu order. Inbox is always included because the database requires it. */
export function teamMenus(menus: readonly string[]): TeamPage[] {
  return TEAM_PAGES.map((page) => page.id).filter((id) => id === "inbox" || menus.includes(id));
}

/** A member with no readable role gets the minimum, never everything. */
export function memberCan(menus: readonly string[] | null | undefined, page: TeamPage) {
  return (menus ?? ["inbox"]).includes(page);
}

/** True when a saved role opens exactly these pages. */
export function sameAccess(a: readonly string[], b: readonly string[]) {
  const left = new Set(a), right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/** Name for a role created from a checklist: readable, at most 60 characters, and unused by this artist. */
export function accessRoleName(menus: readonly string[], taken: readonly string[]) {
  const pages = teamMenus(menus);
  const full = `Access: ${TEAM_PAGES.filter((page) => pages.includes(page.id)).map((page) => page.label).join(", ")}`;
  const base = full.length <= 55 ? full : `Access: ${pages.length} pages`;
  const used = new Set(taken.map((name) => name.toLowerCase()));
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
  return name;
}
