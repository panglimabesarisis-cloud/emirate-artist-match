import { describe, expect, it } from "vitest";
import { FLOW_KINDS, FLOW_STEPS, PAY_LINES, cablePath, connect, demoTotals, starterCables, starterFlow, typedLength, typedLines } from "./data";
import { AGENT_STORY, applyAgent, initialAgent } from "./agent-script";

describe("home page demos", () => {
  it("adds 5% VAT to the sample invoice", () => {
    expect(demoTotals(PAY_LINES)).toEqual({ subtotal: 3350, vat: 167.5, total: 3517.5 });
    expect(demoTotals([])).toEqual({ subtotal: 0, vat: 0, total: 0 });
    expect(demoTotals([{ label: "a", amount: 2500 }, { label: "b", amount: 600 }]).total).toBe(3255);
  });
  it("fills the invoice as the job list is typed", () => {
    expect(typedLines(PAY_LINES, 0)).toEqual([]);
    expect(typedLines(PAY_LINES, 6)).toEqual([{ label: "DJ set", amount: null, done: false }]);
    const first = PAY_LINES[0]!;
    expect(typedLines(PAY_LINES, first.label.length + 2)[0]).toEqual({ label: first.label, amount: 25, done: false });
    const all = typedLines(PAY_LINES, typedLength(PAY_LINES));
    expect(all.map((line) => [line.label, line.amount, line.done])).toEqual(PAY_LINES.map((line) => [line.label, line.amount, true]));
  });
  it("walks the booking from the first message to the calendar", () => {
    expect(AGENT_STORY.flatMap((step) => (step.kind === "say" && step.status ? [step.status] : []))).toEqual(["inquiry", "pending", "paid"]);
    expect(AGENT_STORY.flatMap((step) => (step.kind === "press" ? [step.button] : []))).toEqual(["open-invoice", "stripe", "calendar"]);
    expect(AGENT_STORY.flatMap((step) => (step.kind === "switch" ? [step.thread] : []))).toEqual(["artist", "client", "artist"]);
    expect(AGENT_STORY.at(-1)).toEqual({ kind: "press", button: "calendar" });
  });
  it("lets the artist fill the invoice the client then receives", () => {
    const send = AGENT_STORY.findIndex((step) => step.kind === "send");
    const filled = AGENT_STORY.slice(0, send).reduce(applyAgent, initialAgent());
    expect(filled.page).toEqual({ price: "2500", extra: "Sound system and 2 microphones", extraPrice: "600", editing: false, saved: true });
    expect(demoTotals([{ label: "a", amount: 2500 }, { label: "b", amount: 600 }]).total).toBe(3255);
    const end = AGENT_STORY.reduce(applyAgent, initialAgent());
    expect(end.page).toBeNull();
    const said = AGENT_STORY.flatMap((step) => (step.kind === "say" && step.message.text ? [step.message.text] : []));
    expect(said.indexOf("Wait, I will pay it.")).toBeGreaterThan(0);
    expect(said.indexOf("I'm waiting.")).toBe(said.indexOf("Wait, I will pay it.") + 1);
    expect(end.status).toBe("paid");
    expect(end.thread).toBe("artist");
    expect(end.chats.client.find((message) => message.choices)?.picked).toBe(0);
    expect(end.chats.artist.at(-1)?.card?.button?.id).toBe("calendar");
  });
  it("routes cables forwards and backwards between the right points", () => {
    expect(cablePath({ x: 10, y: 20 }, { x: 200, y: 80 })).toMatch(/^M10 20 C.* 200 80$/);
    const back = cablePath({ x: 900, y: 100 }, { x: 60, y: 360 });
    expect(back.startsWith("M900 100 H")).toBe(true);
    expect(back.endsWith("H60")).toBe(true);
    expect(back).not.toContain("NaN");
    expect(starterFlow()).toHaveLength(FLOW_STEPS.length);
  });
  it("branches after the buttons and ends a booking with job done", () => {
    const cables = starterCables();
    const from = (id: string, port: number) => cables.filter((c) => c.from === id && c.port === port).map((c) => c.to);
    expect([0, 1, 2].map((port) => from("buttons", port))).toEqual([["invoice"], ["why"], ["clients"]]);
    const path = ["invoice"];
    for (let next = cables.find((c) => c.from === path.at(-1)); next; next = cables.find((c) => c.from === path.at(-1))) path.push(next.to);
    expect(path).toEqual(["invoice", "notify", "schedule", "done"]);
  });
  it("sends each cancel reason where it belongs", () => {
    const why = FLOW_STEPS.find((box) => box.id === "why")!;
    expect(why.switches).toBe(true);
    expect(why.branches).toEqual(["Another reason", "Find other talent"]);
    const reaches = (port: number) => starterCables().filter((c) => c.from === "why" && c.port === port).map((c) => c.to);
    expect(reaches(0)).toEqual(["negotiation", "clients", "talents"]);
    expect(reaches(1)).toEqual(["talents"]);
    expect(FLOW_KINDS.talents.title).toBe("List Talent");
    // Every box is built after the boxes it hangs from.
    FLOW_STEPS.forEach((box, i) => box.inputs.forEach(([id]) => expect(FLOW_STEPS.findIndex((other) => other.id === id)).toBeLessThan(i)));
  });
  it("takes a far downward cable round the boxes in between", () => {
    expect(cablePath({ x: 440, y: 270 }, { x: 870, y: 554 }, 16)).toBe("M440 270 H442 Q456 270 456 284 V540 Q456 554 470 554 H870");
  });
  it("keeps practice cables valid", () => {
    expect(starterFlow()[0]?.id).toBe("start");
    const one = connect([], "start", "question");
    expect(one).toEqual([{ from: "start", to: "question", port: 0 }]);
    expect(connect(one, "start", "question")).toBe(one);
    expect(connect(one, "date", "date")).toBe(one);
    expect(connect(one, "question", "start")).toBe(one);
  });
});
