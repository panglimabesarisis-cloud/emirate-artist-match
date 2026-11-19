import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ key: vi.fn(), call: vi.fn(), reconnect: vi.fn() }));
vi.mock("./appUserConnections.server", () => ({ getConnectionKeyForUser: mocks.key }));
vi.mock("@/integrations/lovable/appUserConnector", () => ({ callAsAppUser: mocks.call, appUserReconnectRequired: mocks.reconnect }));
import { checkGoogleAvailability } from "./calendar-availability.server";

describe("live artist calendar lookup", () => {
  const input = { date: "2026-11-19", startTime: "18:00", endTime: "20:00" };
  beforeEach(() => { vi.clearAllMocks(); mocks.key.mockResolvedValue("test-connection"); mocks.reconnect.mockResolvedValue(false); });
  it("uses the artist owner connection and Google freeBusy, not manual blocked dates", async () => {
    mocks.call.mockResolvedValue(new Response(JSON.stringify({ calendars: { primary: { busy: [] } } })));
    expect((await checkGoogleAvailability("owner-id", input)).status).toBe("available");
    expect(mocks.key).toHaveBeenCalledWith("owner-id", "google_calendar");
    const request = mocks.call.mock.calls[0]?.[0];
    expect(request.path).toBe("/calendar/v3/freeBusy");
    expect(JSON.parse(request.init.body)).toEqual({ timeMin: "2026-11-19T18:00:00+04:00", timeMax: "2026-11-19T16:00:00.000Z", timeZone: "Asia/Dubai", items: [{ id: "primary" }] });
  });
  it("returns busy for Google conflicts without disclosing event details", async () => {
    mocks.call.mockResolvedValue(new Response(JSON.stringify({ calendars: { primary: { busy: [{ start: "2026-11-19T15:00:00Z", end: "2026-11-19T16:00:00Z" }] } } })));
    expect((await checkGoogleAvailability("owner-id", input)).status).toBe("busy");
  });
  it("does not treat a disconnected calendar as free", async () => {
    mocks.key.mockResolvedValue(null);
    expect((await checkGoogleAvailability("owner-id", input)).status).toBe("unknown");
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it("does not treat an expired connection as free", async () => {
    mocks.call.mockResolvedValue(new Response("{}", { status: 401 })); mocks.reconnect.mockResolvedValue(true);
    expect((await checkGoogleAvailability("owner-id", input)).status).toBe("unknown");
  });
  it("does not treat incomplete Google results as free", async () => {
    mocks.call.mockResolvedValue(new Response(JSON.stringify({ calendars: { primary: { errors: [{ reason: "notFound" }] } } })));
    expect((await checkGoogleAvailability("owner-id", input)).status).toBe("unknown");
  });
});