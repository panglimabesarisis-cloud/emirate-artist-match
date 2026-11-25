import { describe, expect, it } from "vitest";
import { introProgress, introStages, splitHeading } from "./scroll";

describe("scroll-driven opening", () => {
  it("assembles the title, then types, then raises the panel", () => {
    expect(introStages(0, 100)).toEqual({ title: 0, typed: 0, teaser: 0, rise: 0, ready: false });
    const early = introStages(0.24, 100);
    expect(early.title).toBe(1);
    expect(early.typed).toBeLessThan(10);
    expect(early.rise).toBe(0);
    const typed = introStages(0.52, 100);
    expect(typed.typed).toBe(100);
    expect(typed.ready).toBe(false);
    expect(introStages(0.9, 100)).toEqual({ title: 1, typed: 100, teaser: 0, rise: 1, ready: true });
  });
  it("slides the teaser in after the sentence and before the panel", () => {
    const sliding = introStages(0.52, 100, true);
    expect(sliding.typed).toBe(100);
    expect(sliding.teaser).toBeGreaterThan(0.3);
    expect(sliding.teaser).toBeLessThan(0.7);
    expect(sliding.rise).toBe(0);
    expect(introStages(0.66, 100, true).teaser).toBe(1);
    expect(introStages(0.95, 100, true)).toEqual({ title: 1, typed: 100, teaser: 1, rise: 1, ready: true });
  });
  it("runs from entering the screen to the end of the pinned stretch", () => {
    const view = 800; const height = 2400;
    expect(introProgress({ top: 900, height, header: 60, view })).toBe(0);
    expect(introProgress({ top: 60 - (height - view), height, header: 60, view })).toBe(1);
    expect(introProgress({ top: 60, height, header: 60, view })).toBeGreaterThan(0.2);
  });
  it("splits Latin words into letters but keeps Arabic words whole", () => {
    expect(splitHeading("How It")).toEqual([["H", "o", "w"], ["I", "t"]]);
    expect(splitHeading("كيف يعمل")).toEqual([["كيف"], ["يعمل"]]);
  });
});
