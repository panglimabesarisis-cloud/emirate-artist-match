/** Scroll timing of the pinned introductions: the title assembles, the sentence types, then the panel rises. */

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** With a teaser, a large line slides in between the sentence and the panel, which then covers it. */
export function introStages(progress: number, characters: number, teaser = false) {
  const plan = teaser ? { title: 0.18, typed: [0.16, 0.24], teaser: [0.4, 0.26], rise: [0.68, 0.24] } as const : { title: 0.24, typed: [0.22, 0.3], teaser: [0, 1], rise: [0.5, 0.36] } as const;
  const part = ([from, length]: readonly [number, number]) => clamp01((progress - from) / length);
  const rise = part(plan.rise);
  return { title: clamp01(progress / plan.title), typed: Math.round(part(plan.typed) * characters), teaser: teaser ? part(plan.teaser) : 0, rise, ready: rise >= 0.97 };
}

/** How far down the opening sits so that the heading starts in the middle of the screen; it ends at its usual
 *  place once `lift` reaches 1. */
export function centreShift({ view, head, padding }: { view: number; head: number; padding: number }, lift: number) {
  return Math.max(0, (view - head) / 2 - padding) * (1 - clamp01(lift)) ** 2;
}

/** 0 while the section is still entering the screen, 1 when its pinned stretch has been scrolled through. */
export function introProgress({ top, height, header, view }: { top: number; height: number; header: number; view: number }) {
  const lead = view * 0.55;
  return clamp01((header + lead - top) / Math.max(1, height - view + lead));
}

/** Splits a heading into words, and Latin words into letters. Arabic words stay whole so their letters keep joining. */
export function splitHeading(text: string) {
  return text.split(/\s+/).filter(Boolean).map((word) => (/[؀-ۿ]/.test(word) ? [word] : Array.from(word)));
}
