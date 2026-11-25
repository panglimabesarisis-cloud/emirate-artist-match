import { describe, expect, it } from "vitest";
import { agentRates } from "./agent-pricing";
import { chatAnswers } from "./chat-answers";
import { offerClients } from "./offer-clients";
import { dealSplit, dueDate, rateDraft, ratePayload } from "./ratecard";

const draft = {
  title: "Event hosting", unit_label: "Project", description: "", rules_of_work: "", price_low: "", price_high: "", job_kind: "deliverable" as const, deposit_pct: "40",
  items: [{ desc: "Edit", qty: "1", price: "1000", type: "base" as const, unit: "Project", turnaround: "1 Week" }, { desc: "Extra", qty: "1", price: "100", type: "addon" as const, unit: "Project", turnaround: "" }],
  rush_items: [{ desc: "Same week", rush: "3 Days", price: "300" }, { desc: "", rush: "1 Day", price: "" }],
};

describe("rate card timing", () => {
  it("saves turnaround and rush costs without adding them to the base price", () => {
    const saved = ratePayload(draft);
    expect(saved.price).toBe(1000);
    expect(saved.rush_items).toEqual([{ desc: "Same week", rush: "3 Days", price: 300 }]);
    expect(saved.items[0]!.turnaround).toBe("1 Week");
    expect(saved.items[1]).not.toHaveProperty("turnaround");
    expect(rateDraft(saved).rush_items).toEqual([{ desc: "Same week", rush: "3 Days", price: "300" }]);
    expect(agentRates([saved], null).text).toContain("ready in 3 Days for AED 300 extra");
    expect(() => ratePayload({ ...draft, rush_items: [{ desc: "No price", rush: "1 Day", price: "" }] })).toThrow("price of every rush job");
  });

  it("splits the deposit from the balance and works out due dates", () => {
    expect(dealSplit(1000, "40")).toEqual({ depositPct: 40, balancePct: 60, deposit: 400, balance: 600 });
    expect(dealSplit(1000, "")).toMatchObject({ balancePct: 0 });
    expect(dueDate("2026-11-26", "1 Day")).toBe("2026-11-27");
    expect(dueDate("2026-11-26", "2 Weeks")).toBe("2026-12-10");
    expect(dueDate("2026-11-26", "1 Month")).toBe("2026-12-26");
    expect(dueDate("2026-11-26", "soon")).toBeNull();
  });
});

describe("offer clients", () => {
  it("lists each named client once, with the newest chat, without test or removed chats", () => {
    const chats = [
      { id: "old", client_name: "Maya", last_message_at: "2026-11-01" }, { id: "new", client_name: "maya", last_message_at: "2026-11-20" },
      { id: "anon", client_name: null, last_message_at: "2026-11-22" }, { id: "test", client_name: "Tester", entry_source: "test" },
      { id: "gone", client_name: "Gone", deleted_at: "2026-11-02" }, { id: "booked", client_name: "Client", last_message_at: "2026-11-10" },
    ];
    expect(offerClients(chats, [{ conversation_id: "booked", client_name: "Omar" }]).map(c => [c.id, c.name])).toEqual([["new", "maya"], ["booked", "Omar"]]);
  });
});

describe("answers from the chat", () => {
  it("reads forms and single answers, newest first, and drops contacts and small talk", () => {
    expect(chatAnswers([
      { sender: "client", body: "hi" },
      { sender: "ai", body: "Which organization are you representing?\n[BUTTONS: Private Company | Other]" },
      { sender: "client", body: "Private Company" },
      { sender: "ai", body: "Please fill in the following details." },
      { sender: "client", body: "Event Venue: dubai\nwardrobe requirements?: formal\nPhone: 050\nTime start: [contact hidden]" },
      { sender: "ai", body: "Thanks. What is the dress code?" },
      { sender: "client", body: "Blue" },
      { sender: "client", body: "Event Venue: Dubai Marina" },
    ])).toEqual([
      { label: "Which organization are you representing", value: "Private Company" },
      { label: "Event Venue", value: "Dubai Marina" },
      { label: "wardrobe requirements", value: "formal" },
      { label: "What is the dress code", value: "Blue" },
    ]);
  });
});
