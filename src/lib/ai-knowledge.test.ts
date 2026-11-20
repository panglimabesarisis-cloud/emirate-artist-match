import { describe, expect, it } from "vitest";
import { flowKnowledgePrompt, type FlowNode } from "./ai-flow";
import { copyTemplate } from "./flow-templates";

const knowledge: FlowNode = { id: "knowledge", type: "knowledge", position: { x: 0, y: 0 }, data: { title: "Sound & Rider", text: "Client supplies the PA.", knowledgeQA: [{ question: "Do you bring speakers?", answer: "The client supplies the PA." }] } };
describe("AI Knowledge reference data", () => {
  it("includes facts and Q&A before replies even without canvas connections", () => {
    const references = JSON.parse(flowKnowledgePrompt([knowledge]).split("\n").slice(1).join("\n"));
    expect(references).toEqual([{ topic: "Sound & Rider", facts: "Client supplies the PA.", qa: [{ question: "Do you bring speakers?", answer: "The client supplies the PA." }] }]);
  });
  it("does not use message cards as knowledge", () => {
    expect(flowKnowledgePrompt([{ ...knowledge, type: "message" }])).toBe("");
  });
  it("ignores incomplete question-answer pairs", () => {
    expect(flowKnowledgePrompt([{ ...knowledge, data: { text: "", knowledgeQA: [{ question: "Speakers?", answer: "" }] } }])).toBe("");
  });
  it("preserves titles and knowledge through template copying without shared edits", () => {
    const original = { nodes: [knowledge], edges: [] };
    const copy = copyTemplate(original);
    expect(copy.nodes[0]?.data).toEqual(knowledge.data);
    if (copy.nodes[0]) copy.nodes[0].data.title = "Changed";
    expect(original.nodes[0]?.data.title).toBe("Sound & Rider");
  });
});