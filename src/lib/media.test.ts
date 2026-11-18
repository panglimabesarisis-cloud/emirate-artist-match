import { describe, it, expect } from "vitest";
import { youtubeId } from "./media";
describe("youtubeId", () => {
  it("parses watch, short and shorts links", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ?t=3")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("rejects other links", () => { expect(youtubeId("https://vimeo.com/123")).toBeNull(); });
});
