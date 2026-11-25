import { describe, expect, it } from "vitest";
import { AGENT_CHAPTER, CHAPTERS, CONTACTS, STORY, applyStep, chapterStart, initialPhone, phoneAt, type Step } from "./phone-stories";

const index = (match: (step: Step) => boolean) => STORY.findIndex(match);
const says = (part: string) => index((step) => step.kind === "say" && step.message.text.includes(part));
const overlay = (title: string) => index((step) => step.kind === "overlay" && step.overlay.title === title);

describe("home phone story", () => {
  it("opens three unread chats and replies to each before the fan", () => {
    const first = STORY.slice(0, chapterStart(1));
    expect(first.flatMap((step) => (step.kind === "open" ? [step.chat] : []))).toEqual(["sara", "mike", "unknown"]);
    expect(first.filter((step) => step.kind === "say" && step.message.mine)).toHaveLength(3);
    expect(phoneAt(chapterStart(1)).unread["sara"]).toBeGreaterThan(0);
  });
  it("tells the story in order", () => {
    const order = [overlay("BLOCKED"), overlay("How many chats like this do you get?"), index((step) => step.kind === "incoming" && step.text.includes("company dinner")), overlay("A few hours later…"), says("refund you"), overlay("You are in trouble"),
      overlay("Let's see how our agent works"), says("What kind of job"), says("fill in this short form"), overlay("Agent confirms the invoice with the artist"), index((step) => step.kind === "approve"),
      says("Here is your invoice"), overlay("AI agent confirms with the artist"), says("Yes, apply this job"), says("Payment received"), overlay("AI agent confirms to the artist"), says("now in your schedule")];
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
  it("ends with the fan blocked, the invoice approved and every chat known", () => {
    const end = STORY.reduce(applyStep, initialPhone());
    expect(end.blocked).toEqual(["fan"]);
    expect(end.approved).toBe(true);
    expect(end.chapter).toBe(AGENT_CHAPTER);
    expect(CHAPTERS).toHaveLength(AGENT_CHAPTER + 1);
    expect(end.order.every((id) => CONTACTS[id])).toBe(true);
    expect(end.threads["layla"]?.find((message) => message.choices)?.picked).toBe(0);
  });
  it("changes nothing outside the step and never mutates the earlier state", () => {
    const start = initialPhone();
    const opened = applyStep(start, { kind: "open", chat: "mike" });
    expect(opened.unread["mike"]).toBe(0);
    expect(start.unread["mike"]).toBe(1);
    const shown = applyStep(opened, { kind: "overlay", overlay: { title: "x", tone: "ask" } });
    expect(applyStep(shown, { kind: "list" }).overlay).toBeNull();
  });
});
