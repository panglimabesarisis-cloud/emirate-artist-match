import { describe, expect, it } from "vitest";
import { artistDecisionBranch, isBranching, verifiedArtistDecision, whatsappEdges, type FlowNode, type FlowEdge } from "./ai-flow";

const nodes: FlowNode[] = [
  { id: "start", type: "start", position: { x: 0, y: 0 }, data: { text: "Hello" } },
  { id: "wa", type: "whatsapp", position: { x: 0, y: 100 }, data: { text: "Request approval", destinationPhone: "+971501234567" } },
  { id: "invoice", type: "invoice", position: { x: 0, y: 200 }, data: { text: "Invoice" } },
  { id: "alternative", type: "question", position: { x: 200, y: 200 }, data: { text: "Alternative date?" } },
];
const edges: FlowEdge[] = [
  { id: "entry", source: "start", target: "wa" },
  { id: "yes", source: "wa", target: "invoice", sourceHandle: "yes" },
  { id: "no", source: "wa", target: "alternative", sourceHandle: "no" },
];

describe("artist WhatsApp Yes/No", () => {
  it("supports a branching WhatsApp card", () => expect(isBranching("whatsapp")).toBe(true));
  it("routes Yes to invoice", () => expect(artistDecisionBranch(nodes, edges, "yes")?.id).toBe("invoice"));
  it("routes No to the alternative date", () => expect(artistDecisionBranch(nodes, edges, "no")?.id).toBe("alternative"));
  it("does not activate disconnected approvals", () => expect(artistDecisionBranch(nodes, edges.filter(e => e.id !== "entry"), "yes")).toBeNull());
  it("retains legacy approval edges as Yes only", () => {
    const legacy = [{ id: "old", source: "wa", target: "invoice" }];
    expect(whatsappEdges(nodes, legacy)[0]?.sourceHandle).toBe("yes");
    expect(artistDecisionBranch(nodes, legacy, "no")).toBeNull();
    expect(legacy[0]).not.toHaveProperty("sourceHandle");
  });
  it("accepts the artist's committed approval", () => expect(verifiedArtistDecision({ status: "quoted", cancelled_by: null })).toBe("yes"));
  it("accepts only artist declines for No", () => {
    expect(verifiedArtistDecision({ status: "cancelled", cancelled_by: "artist" })).toBe("no");
    expect(verifiedArtistDecision({ status: "cancelled", cancelled_by: "client" })).toBeNull();
  });
  it("cannot treat pending approval or a paid booking as a new Yes", () => {
    expect(verifiedArtistDecision({ status: "inquiry", cancelled_by: null })).toBeNull();
    expect(verifiedArtistDecision({ status: "confirmed", cancelled_by: null })).toBeNull();
  });
});