import { describe, expect, it } from "vitest";
import { accessRoleName, memberCan, sameAccess, TEAM_PAGES, teamMenus } from "./team-access";

describe("team page access", () => {
  it("always includes the inbox and drops pages that cannot be given", () => {
    expect(teamMenus([])).toEqual(["inbox"]);
    expect(teamMenus(["media", "wallet", "team", "bookings"])).toEqual(["inbox", "bookings", "media"]);
  });
  it("only opens checked pages, and only the inbox when the role is unreadable", () => {
    expect(memberCan(["inbox", "bookings"], "bookings")).toBe(true);
    expect(memberCan(["inbox", "bookings"], "invoices")).toBe(false);
    expect(TEAM_PAGES.filter((page) => memberCan(null, page.id)).map((page) => page.id)).toEqual(["inbox"]);
  });
  it("reuses a role only when it opens exactly the same pages", () => {
    expect(sameAccess(["bookings", "inbox"], ["inbox", "bookings"])).toBe(true);
    expect(sameAccess(["inbox", "bookings", "media"], ["inbox", "bookings"])).toBe(false);
  });
  it("names new roles readably, within 60 characters and without clashes", () => {
    expect(accessRoleName(["bookings"], [])).toBe("Access: Inbox, Bookings");
    expect(accessRoleName(["bookings"], ["access: inbox, bookings", "Access: Inbox, Bookings (2)"])).toBe("Access: Inbox, Bookings (3)");
    const all = TEAM_PAGES.map((page) => page.id);
    expect(accessRoleName(all, [])).toBe("Access: 7 pages");
    expect(accessRoleName(all, ["Access: 7 pages"]).length).toBeLessThanOrEqual(60);
  });
});
