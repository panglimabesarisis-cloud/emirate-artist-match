import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), inserts: [] as Record<string, unknown>[], sentToday: 0, quotePhone: "+971500000001" as string | null }));

vi.mock("./whatsapp-provider.server", () => ({ sendWhatsApp: mocks.send, readWhatsAppConfig: vi.fn(), WHATSAPP_TEMPLATE: "t" }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      let inserted: Record<string, unknown> | null = null;
      const result = () => {
        if (table === "artists") return { data: { notify_phone: "+971500000009", manager_phone: "+971500000009" }, error: null };
        if (table === "quote_requests") return { data: { phone: mocks.quotePhone }, error: null };
        if (inserted) {
          const duplicate = mocks.inserts.slice(0, -1).some((row) => row["kind"] === inserted!["kind"] && row["recipient"] === inserted!["recipient"]);
          return duplicate ? { data: null, error: { code: "23505" } } : { data: { id: "n1" }, error: null };
        }
        return { data: null, error: null, count: mocks.sentToday };
      };
      const chain = {
        select: () => chain, eq: () => chain, like: () => chain, gte: () => chain, limit: () => chain, update: () => chain,
        insert: (row: Record<string, unknown>) => { inserted = row; mocks.inserts.push(row); return chain; },
        single: async () => result(), maybeSingle: async () => result(),
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return chain;
    },
  },
}));

import { flowToPrompt, type FlowEdge, type FlowNode } from "./ai-flow";
import { nextSavedForm } from "./agent-forms";
import { selectedWhatsAppStep } from "./agent-approval";
import { capturedValues, decisionNotices, fillNotice, noticeRequest, passedNotices, reachableNotices } from "./flow-whatsapp";
import { capturedVariables } from "./flow-variables";
import { notifyFlowSteps } from "./notify.server";

const node = (id: string, type: FlowNode["type"], data: Partial<FlowNode["data"]> = {}): FlowNode => ({ id, type, position: { x: 0, y: 0 }, data: { text: id, ...data } });
const edge = (source: string, target: string, sourceHandle: string | null = null): FlowEdge => ({ id: `${source}-${target}`, source, target, sourceHandle });

const nodes = [
  node("start", "start"), node("hello", "wa_artist"),
  node("pick", "buttons", { buttons: ["Book Now", "Later"], saveAs: "package" }),
  node("tell", "wa_client", { text: "secret saved text" }), node("approve", "whatsapp"), node("later", "message"),
  node("approved", "wa_client"), node("details", "form", { fields: [{ label: "Venue", type: "text", saveAs: "venue_name" }] }),
  node("lost", "wa_client"),
];
const edges = [edge("start", "hello"), edge("hello", "pick"), edge("pick", "tell", "b0"), edge("tell", "approve"), edge("pick", "later", "b1"), edge("approve", "approved", "yes"), edge("approve", "details", "no")];
const asked = { sender: "ai", body: "Ready? [BUTTONS: Book Now | Later]" };
const ids = (list: FlowNode[]) => list.map((n) => n.id);

describe("flow WhatsApp steps", () => {
  it("only lists steps connected to the flow", () => {
    expect(ids(reachableNotices(nodes, edges))).toEqual(["hello", "tell", "approved"]);
  });

  it("fires the steps on the path the client actually took", () => {
    expect(ids(passedNotices(nodes, edges, [{ sender: "client", body: "Hi" }], true))).toEqual(["hello"]);
    expect(ids(passedNotices(nodes, edges, [asked, { sender: "client", body: "Book Now" }], false))).toEqual(["tell"]);
    expect(passedNotices(nodes, edges, [asked, { sender: "client", body: "Later" }], false)).toEqual([]);
    expect(passedNotices(nodes, edges, [asked, { sender: "client", body: "How much?" }], false)).toEqual([]);
  });

  it("starts at the incoming trigger, even when the greeting is listed first", () => {
    const flow = [node("greet", "start"), node("trigger", "start"), node("tell", "wa_artist")];
    expect(ids(passedNotices(flow, [edge("trigger", "tell"), edge("tell", "greet")], [{ sender: "client", body: "Hi" }], true))).toEqual(["tell"]);
  });

  it("fires only the branch of a verified artist decision", () => {
    expect(ids(decisionNotices(nodes, edges, "yes"))).toEqual(["approved"]);
    expect(decisionNotices(nodes, edges, "no")).toEqual([]);
  });

  it("keeps approval and form steps working with a message block in between", () => {
    expect(selectedWhatsAppStep(nodes, edges, [asked, { sender: "client", body: "Book Now" }])?.id).toBe("approve");
    const chain = [node("start", "start"), node("pick", "buttons", { buttons: ["Go"] }), node("tell", "wa_artist"), nodes[7]!];
    const links = [edge("start", "pick"), edge("pick", "tell", "b0"), edge("tell", "details")];
    expect(nextSavedForm(chain, links, [{ sender: "ai", body: "? [BUTTONS: Go]" }, { sender: "client", body: "Go" }])?.id).toBe("details");
  });

  it("fills saved answers and hides contact details", () => {
    const values = capturedValues(nodes, [asked, { sender: "client", body: "Book Now" }, { sender: "client", body: "Venue: Atlantis" }], { client_name: "Maya", event_date: "2026-12-19", budget: null });
    expect(values).toEqual({ client_name: "Maya", event_date: "2026-12-19", package: "Book Now", venue_name: "Atlantis" });
    expect(fillNotice("**Hi** {client_name}, {event_date} at {venue_name}. {budget} Call 0501234567", { ...values, venue_name: "x@y.com" }))
      .toBe("*Hi* Maya, 2026-12-19 at [contact hidden]. - Call [contact hidden]");
  });

  it("never lets the AI choose an unknown step or see the saved text", () => {
    const notices = reachableNotices(nodes, edges);
    expect(noticeRequest(JSON.stringify({ nodeId: "lost", values: [] }), notices)).toBeNull();
    expect(noticeRequest(JSON.stringify({ nodeId: "tell", values: [{ name: "budget", value: "5000" }] }), notices)?.values).toEqual({ budget: "5000" });
    const prompt = flowToPrompt(nodes, edges);
    expect(prompt).toContain('send_whatsapp with nodeId "tell"');
    expect(prompt).not.toContain("secret saved text");
  });

  it("lists answers the flow already collects with their card", () => {
    expect(capturedVariables(nodes)).toEqual([{ name: "package", from: "Buttons" }, { name: "venue_name", from: "Form" }]);
  });
});

describe("sending a flow step", () => {
  const chat = { id: "c1", access_key: "key", artist_id: "a1", client_user_id: null, quote_request_id: "q1" };
  beforeEach(() => { vi.clearAllMocks(); mocks.inserts.length = 0; mocks.sentToday = 0; mocks.quotePhone = "+971500000001"; mocks.send.mockResolvedValue({ status: "accepted" }); });

  it("messages the artist once and the client with their chat link", async () => {
    await notifyFlowSteps(chat, "Sample Singer", [{ nodeId: "hello", audience: "artist", text: "A" }, { nodeId: "tell", audience: "client", text: "C" }]);
    expect(mocks.send.mock.calls).toEqual([
      ["+971500000009", "Dealmaker AI Agent", "A", "https://dealmakertalent.com/dashboard/chat/c1"],
      ["+971500000001", "Dealmaker · Sample Singer", "C", "https://dealmakertalent.com/chat/c1?k=key"],
    ]);
    await notifyFlowSteps(chat, "Sample Singer", [{ nodeId: "tell", audience: "client", text: "C" }]);
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("messages the assistant's number, or the manager when the block has none", async () => {
    await notifyFlowSteps(chat, "Sample Singer", [{ nodeId: "help", audience: "assistant", text: "H", phone: "0501234567" }, { nodeId: "other", audience: "assistant", text: "O" }]);
    expect(mocks.send.mock.calls.map(call => call[0])).toEqual(["+971501234567", "+971500000009"]);
    mocks.sentToday = 50;
    await notifyFlowSteps(chat, "Sample Singer", [{ nodeId: "third", audience: "assistant", text: "T" }]);
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("stops at the daily limit of a client number and without a number", async () => {
    mocks.sentToday = 5;
    await notifyFlowSteps(chat, "Sample Singer", [{ nodeId: "tell", audience: "client", text: "C" }]);
    mocks.sentToday = 0; mocks.quotePhone = null;
    await notifyFlowSteps(chat, "Sample Singer", [{ nodeId: "tell", audience: "client", text: "C" }]);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
