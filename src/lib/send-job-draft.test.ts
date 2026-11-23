import { describe, expect, it } from "vitest";
import { emptyJobFields, jobDraftInput, type JobDraft } from "./send-job-draft";

const draft: JobDraft = { id: "10000000-0000-4000-8000-000000000003", fields: { ...emptyJobFields, title: "Male MC", categoryId: "10000000-0000-4000-8000-000000000004", brief: "Gala dinner in Abu Dhabi", eventDate: "2026-12-20", startTime: "23:00", endTime: "01:00", venue: "Abu Dhabi", budget: "3000", eventType: "Gala dinner" }, documents: [], ownerId: null, pending: true, step: 3 };
describe("Send Job draft submission", () => {
  it("retains one submission ID when resumed after signup", () => {
    expect(jobDraftInput(draft).submissionId).toBe("10000000-0000-4000-8000-000000000003");
    expect(jobDraftInput({ ...draft, ownerId: "10000000-0000-4000-8000-000000000005" }).submissionId).toBe(jobDraftInput(draft).submissionId);
  });
  it("preserves the client's AED 3000 budget", () => expect(jobDraftInput(draft).budgetAED).toBe(3000));
  it("retains the selected category for broadcast", () => expect(jobDraftInput(draft).categoryId).toBe("10000000-0000-4000-8000-000000000004"));
  it("retains overnight event hours", () => expect(jobDraftInput(draft).endTime).toBe("01:00"));
});