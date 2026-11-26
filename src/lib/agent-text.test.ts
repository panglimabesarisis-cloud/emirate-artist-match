import { describe, expect, it } from "vitest";
import { tidyAnswer } from "./agent-text";
import { pickMediaModel } from "./agent-media";

describe("agent answers", () => {
  it("turns fenced HTML into formatted text", () => {
    const out = tidyAnswer('Profile\n```html\n<div><h2>Name</h2><ul><li><b>Role</b>: Prince</li></ul><a href="https://example.com/a">Site</a></div>\n```');
    expect(out).not.toMatch(/<|```/);
    expect(out).toContain("## Name");
    expect(out).toContain("- **Role**: Prince");
    expect(out).toContain("[Site](https://example.com/a)");
  });
  it("shows a list of sources as a table", () => {
    const out = tidyAnswer("Done.\n\n**Sources**\n- [One](https://example.com/1)\n- [Two](https://example.com/2)");
    expect(out).toContain("| No | Source | Link |");
    expect(out).toContain("| 2 | Two | [Open](https://example.com/2) |");
  });
  it("keeps tables with line breaks and code that is not HTML", () => {
    expect(tidyAnswer("| A |\n| --- |\n| x<br>y |")).toContain("| x y |");
    expect(tidyAnswer("```js\nconst a = 1;\n```")).toBe("```js\nconst a = 1;\n```");
  });
});

describe("media models", () => {
  it("takes the newest picture and video model", () => {
    const m = (name: string, method: string) => ({ name: `models/${name}`, supportedGenerationMethods: [method] });
    const list = [m("gemini-2.5-flash-image", "generateContent"), m("gemini-3.1-flash-image", "generateContent"), m("gemini-3.8-flash", "generateContent"), m("veo-3.0-generate-001", "predictLongRunning"), m("veo-3.1-fast-generate-preview", "predictLongRunning")];
    expect(pickMediaModel("image", list)).toBe("gemini-3.1-flash-image");
    expect(pickMediaModel("video", list)).toBe("veo-3.1-fast-generate-preview");
    expect(pickMediaModel("video", [])).toBeNull();
  });
});
