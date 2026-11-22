import { describe, it, expect } from "vitest";
import {
  buildAgentReport,
  calendarDraftSchema,
  googleEventPayload,
  templateAllowed,
  inheritedFeatures,
  calendarAllowed,
  decodeAgentBody,
  encodeAgentBody,
  type CalendarDraft,
} from "./my-agent-rules";
const draft: CalendarDraft = {
  title: "Wedding",
  date: "2026-12-09",
  startTime: "18:00",
  endTime: "21:00",
  description: "Sound check at 17:00",
  attendees: ["client@example.com"],
};
describe("Your AI Agent business rules", () => {
  it("requires event name, date and both hours", () => {
    expect(calendarDraftSchema.safeParse({ ...draft, title: "" }).success).toBe(false);
    expect(calendarDraftSchema.safeParse({ ...draft, endTime: "" }).success).toBe(false);
    expect(calendarDraftSchema.safeParse({ ...draft, date: "2026-02-30" }).success).toBe(false);
  });
  it("creates UAE calendar times and invitations with supplied email only", () => {
    const event = googleEventPayload(draft, "10000000-0000-0000-0000-000000000001");
    expect(event.start).toEqual({ dateTime: "2026-12-09T18:00:00+04:00", timeZone: "Asia/Dubai" });
    expect(event.end.dateTime).toBe("2026-12-09T17:00:00.000Z");
    expect(event.attendees).toEqual([{ email: "client@example.com" }]);
    expect(event.description).toBe("Sound check at 17:00");
    expect(googleEventPayload(draft, "10000000-0000-0000-0000-000000000001").id).toBe(event.id);
  });
  it("rejects invalid invitation email and equal hours", () => {
    expect(calendarDraftSchema.safeParse({ ...draft, attendees: ["invalid"] }).success).toBe(false);
    expect(calendarDraftSchema.safeParse({ ...draft, endTime: "18:00" }).success).toBe(false);
  });
  it("blocks contract templates above the effective subscription", () => {
    expect(templateAllowed(3, 1)).toBe(false);
    expect(templateAllowed(3, 3)).toBe(true);
    expect(templateAllowed(1, 3)).toBe(true);
  });
  it("preserves inherited Calendar feature but does not grant it to Free", () => {
    const tiers = [
      { sort: 1, features: ["Basic AI agent"] },
      { sort: 3, features: ["Calendar sync"] },
      { sort: 4, features: ["Everything in Medium"] },
    ];
    expect(calendarAllowed(inheritedFeatures(tiers, 1))).toBe(false);
    expect(calendarAllowed(inheritedFeatures(tiers, 4))).toBe(true);
  });
  it("builds requested tables and charts from actual invoice amounts", () => {
    const result = buildAgentReport(
      {
        source: "invoices",
        metric: "outstanding",
        groupBy: "month",
        from: "2026-11-01",
        to: "2026-11-30",
        chart: "bar",
      },
      [
        { client: "A", date: "2026-11-01", status: "partial", total: 1050, paid: 210 },
        { client: "B", date: "2026-11-02", status: "paid", total: 525, paid: 525 },
        { client: "C", date: "2026-12-01", status: "unpaid", total: 100, paid: 0 },
      ],
    );
    expect(result.rows).toEqual([["2026-11", 840]]);
    expect(result.chart?.points).toEqual([{ label: "2026-11", value: 840 }]);
    expect(result.count).toBe(2);
  });
  it("returns actual detail rows and no chart when none requested", () => {
    const result = buildAgentReport(
      {
        source: "bookings",
        metric: "count",
        groupBy: "records",
        from: null,
        to: null,
        chart: "none",
      },
      [{ client: "A", date: "2026-11-22", status: "quoted", total: 105, paid: 0 }],
    );
    expect(result.rows).toEqual([["A", "2026-11-22", "quoted", 105, 0, 105]]);
    expect(result.chart).toBeNull();
  });
  it("persists structured reports and retains older plain text", () => {
    const body = {
      text: "Report",
      reports: [],
      invoices: [],
      contracts: [],
      actionIds: [],
      tools: [],
    };
    expect(decodeAgentBody(encodeAgentBody(body))).toEqual(body);
    expect(decodeAgentBody("Old answer").text).toBe("Old answer");
  });
});
