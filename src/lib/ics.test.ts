import { describe, it, expect } from "vitest";
import { buildIcs } from "./ics";

describe("buildIcs", () => {
  const ics = buildIcs("DJ, Falcon", [{ uid: "b1", date: "2026-12-31", title: "Wedding; Signature", description: "line1\nline2" }], new Date("2026-11-18T10:00:00Z"));
  it("all-day event ends the next day, across year end", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231");
    expect(ics).toContain("DTEND;VALUE=DATE:20270101");
  });
  it("escapes special characters", () => {
    expect(ics).toContain("SUMMARY:Wedding\\; Signature");
    expect(ics).toContain("X-WR-CALNAME:DJ\\, Falcon");
    expect(ics).toContain("DESCRIPTION:line1\\nline2");
  });
  it("uses CRLF line endings", () => {
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });
});
