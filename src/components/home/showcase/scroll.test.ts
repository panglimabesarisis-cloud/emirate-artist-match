import { describe, expect, it } from "vitest";
import { centreShift, introProgress, introStages, splitHeading } from "./scroll";

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
  it("starts the heading in the middle of the screen and lifts it to the top", () => {
    const sizes = { view: 800, head: 300, padding: 40 };
    expect(centreShift(sizes, 0)).toBe(210);
    expect(centreShift(sizes, 0.5)).toBeLessThan(210);
    expect(centreShift(sizes, 1)).toBe(0);
    // A heading taller than the screen stays where it is.
    expect(centreShift({ view: 400, head: 600, padding: 20 }, 0)).toBe(0);
  });
  it("splits Latin words into letters but keeps Arabic words whole", () => {
    expect(splitHeading("How It")).toEqual([["H", "o", "w"], ["I", "t"]]);
    expect(splitHeading("كيف يعمل")).toEqual([["كيف"], ["يعمل"]]);
  });
});
