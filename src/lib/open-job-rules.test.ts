import { describe, expect, it } from "vitest";
import { applicationSchema, openJobSchema, validateJobDocument } from "./open-job-rules";
describe("open inquiry rules", () => {
  const request = { title: "Male MC", brief: "Gala dinner in Abu Dhabi", eventDate: "2026-12-20", startTime: "23:00", endTime: "01:00", venue: "Abu Dhabi", budgetAED: 3000 };
  it("keeps the client's AED 3000 budget", () => expect(openJobSchema.parse(request).budgetAED).toBe(3000));
  it("accepts overnight event times", () => expect(openJobSchema.parse(request).endTime).toBe("01:00"));
  it("rejects a nonpositive budget", () => expect(openJobSchema.safeParse({ ...request, budgetAED: 0 }).success).toBe(false));
  it("does not interpret applying as price agreement", () => expect(applicationSchema.parse({ jobId: "10000000-0000-4000-8000-000000000001", artistId: "10000000-0000-4000-8000-000000000002", message: "Interested", proposedAED: null }).proposedAED).toBeNull());
  it("accepts a PDF brief", () => expect(() => validateJobDocument(new TextEncoder().encode("%PDF-1.7 test"), "application/pdf")).not.toThrow());
  it("rejects a forged PDF MIME type", () => expect(() => validateJobDocument(new TextEncoder().encode("<script>"), "application/pdf")).toThrow());
});