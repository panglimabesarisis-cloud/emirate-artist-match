import { describe, expect, it } from "vitest";
import { readSummary, sameName } from "./person-photo";
import { decodeAgentBody, encodeAgentBody } from "./my-agent-rules";

const summary = { type: "standard", title: "Ahmad Sahroni", wikibase_item: "Q123", thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/320px-X.jpg" }, content_urls: { desktop: { page: "https://id.wikipedia.org/wiki/Ahmad_Sahroni" } } };

describe("person photo", () => {
  it("needs every word of the name in the article title", () => {
    expect(sameName("ahmad sahroni", "Ahmad Sahroni (politikus)")).toBe(true);
    expect(sameName("Ahmad Sahroni", "Ahmad Yani")).toBe(false);
    expect(sameName("", "Ahmad")).toBe(false);
  });
  it("takes only a Wikimedia photo of a normal article about that name", () => {
    expect(readSummary("Ahmad Sahroni", summary)?.photo).toBe(summary.thumbnail.source);
    const thumb = "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/78/Name_(1).jpg/330px-Name.jpg?utm_source=id.wikipedia.org";
    expect(readSummary("Ahmad Sahroni", { ...summary, thumbnail: { source: thumb } })?.photo).toBe(thumb);
    for (const bad of [{ type: "disambiguation" }, { thumbnail: { source: "https://evil.example/x.jpg" } }, { title: "Someone Else" }, { thumbnail: {} }]) expect(readSummary("Ahmad Sahroni", { ...summary, ...bad })).toBeNull();
  });
  it("keeps the photo with the saved answer and still reads older answers", () => {
    const body = { text: "t", reports: [], invoices: [], contracts: [], actionIds: [], tools: [] };
    expect(decodeAgentBody(encodeAgentBody(body)).photo).toBeUndefined();
    const photo = { name: "Ahmad Sahroni", photo: summary.thumbnail.source, page: summary.content_urls.desktop.page };
    expect(decodeAgentBody(encodeAgentBody({ ...body, photo })).photo).toEqual(photo);
  });
});
