import { describe, expect, it } from "vitest";
import { calendarWindow, busyOverlaps, verifiedCalendarDraft, artistApprovalDraft } from "./calendar-rules";

describe("Google Calendar availability", () => {
  const window = calendarWindow({ date: "2026-11-19", startTime: "18:00", endTime: "20:00" });
  it("checks UAE event hours against Google busy intervals", () => {
    expect(window.timeMin).toBe("2026-11-19T18:00:00+04:00");
    expect(window.timeMax).toBe("2026-11-19T16:00:00.000Z");
    expect(busyOverlaps(window, [{ start: "2026-11-19T15:00:00Z", end: "2026-11-19T17:00:00Z" }])).toBe(true);
  });
  it("does not block adjacent non-overlapping events", () => {
    expect(busyOverlaps(window, [{ start: "2026-11-19T12:00:00Z", end: "2026-11-19T14:00:00Z" }])).toBe(false);
  });
  it("handles overnight performance", () => {
    expect(calendarWindow({ date: "2026-11-19", startTime: "23:00", endTime: "01:00" }).timeMax).toBe("2026-11-19T21:00:00.000Z");
  });
  it("checks a whole UAE date if times are not known", () => {
    expect(calendarWindow({ date: "2026-11-19" }).timeMax).toBe("2026-11-19T20:00:00.000Z");
  });
  it("requires a verified Google result for the draft date and hours", () => {
    expect(verifiedCalendarDraft("2026-11-19", { status: "available", window })).toBe(true);
    expect(verifiedCalendarDraft("2026-11-20", { status: "available", window })).toBe(false);
    expect(verifiedCalendarDraft("2026-11-19", { status: "busy", window })).toBe(false);
    expect(verifiedCalendarDraft("2026-11-19", { status: "unknown", window })).toBe(false);
    expect(verifiedCalendarDraft("2026-11-19", undefined)).toBe(false);
    expect(verifiedCalendarDraft("2026-11-19", { status: "available", window: calendarWindow({ date: "2026-11-19" }) })).toBe(false);
  });
  it("allows unknown schedules only as pending artist approval", () => {
    expect(artistApprovalDraft("2026-11-19", { status: "unknown", window })).toBe(true);
    expect(artistApprovalDraft("2026-11-19", { status: "busy", window })).toBe(false);
    expect(artistApprovalDraft("2026-11-19", undefined)).toBe(false);
    expect(artistApprovalDraft("2026-11-20", { status: "unknown", window })).toBe(false);
    expect(artistApprovalDraft("2026-11-19", { status: "unknown", window: calendarWindow({ date: "2026-11-19" }) })).toBe(false);
  });
  it("rejects invalid dates and partial hours", () => {
    expect(() => calendarWindow({ date: "2026-02-30" })).toThrow();
    expect(() => calendarWindow({ date: "2026-11-19", startTime: "18:00" })).toThrow();
  });
});