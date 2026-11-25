import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { MousePointer2 } from "lucide-react";

/** Shared parts of the home page demos. They only change local state: nothing is sent or saved. */

/** How much slower than the written timings every demo plays. */
export const PACE = 1.35;

class Stopped extends Error {}
export type Director = {
  /** Waits while counting only the time the demo is on screen, and returns that time. Throws once the run is cancelled. */
  wait: (ms: number) => Promise<number>;
  /** Calls `frame` with an eased 0..1 progress over `ms`. */
  tween: (ms: number, frame: (progress: number) => void) => Promise<void>;
};

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Starts `script` the first time the stage scrolls into view; `replay` starts it again and `stop` hands control to the visitor. */
export function useDemoScript<T extends HTMLElement>(script: (director: Director) => Promise<void>, startAt = 0.2, ready = true) {
  const ref = useRef<T>(null);
  const visible = useRef(false);
  const latest = useRef(script);
  latest.current = script;
  const cancel = useRef<() => void>(() => {});
  const [seen, setSeen] = useState(false);
  const [run, setRun] = useState(0);
  const reduced = useReducedMotion();
  // `ready` is false until the panel has arrived, or while the visitor paused it: the demo holds meanwhile.
  const going = useRef(ready);
  going.current = ready;
  const [armed, setArmed] = useState(ready);
  useEffect(() => { if (ready) setArmed(true); }, [ready]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = !!entry?.isIntersecting;
      if (entry?.isIntersecting && entry.intersectionRatio >= startAt - 0.01) setSeen(true);
    }, { threshold: [0, startAt] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [startAt]);

  useEffect(() => {
    if (!seen || !armed || reduced) return;
    let cancelled = false;
    const wait = (ms: number) => new Promise<number>((resolve, reject) => {
      let spent = 0;
      let before = performance.now();
      const tick = () => {
        if (cancelled) { reject(new Stopped()); return; }
        const now = performance.now();
        if (visible.current && going.current && !document.hidden) spent += now - before;
        before = now;
        if (spent >= ms * PACE) resolve(spent / PACE); else setTimeout(tick, Math.max(8, Math.min(ms * PACE - spent, 60)));
      };
      setTimeout(tick, Math.max(0, Math.min(ms, 60)));
    });
    const tween = async (ms: number, frame: (progress: number) => void) => {
      // Driven by elapsed time, so a browser that slows its timers skips frames instead of crawling.
      for (let done = 0; done < ms;) {
        done += await wait(Math.min(24, ms - done));
        const x = Math.min(1, done / ms);
        frame(x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
      }
    };
    cancel.current = () => { cancelled = true; };
    latest.current({ wait, tween }).catch((error: unknown) => { if (!(error instanceof Stopped)) console.error(error); });
    return () => { cancelled = true; };
  }, [seen, armed, run, reduced]);

  const replay = useCallback(() => { cancel.current(); setSeen(true); setArmed(true); setRun((value) => value + 1); }, []);
  const stop = useCallback(() => cancel.current(), []);
  return { ref, replay, stop, reduced };
}

export type CursorState = { x: number; y: number; shown: boolean; down: boolean; ms: number };
export const hiddenCursor: CursorState = { x: 40, y: 40, shown: false, down: false, ms: 700 };

/** A scripted pointer that visits elements marked `data-demo="name"` inside the stage. */
export function useCursor(stage: RefObject<HTMLElement | null>) {
  const [cursor, setCursor] = useState<CursorState>(hiddenCursor);
  const move = useCallback(async (director: Director, name: string, ms = 750) => {
    const root = stage.current;
    // The same target can exist twice (a list and its phone-sized switcher): take the visible one.
    const target = Array.from(root?.querySelectorAll<HTMLElement>(`[data-demo="${name}"]`) ?? []).find((el) => el.getClientRects().length > 0);
    if (!root || !target) return;
    const base = root.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    const k = base.width ? root.offsetWidth / base.width : 1; // undo any scaling of the stage
    setCursor((c) => ({ ...c, shown: true, ms, x: (box.left - base.left + Math.min(box.width * 0.6, box.width - 8)) * k, y: (box.top - base.top + box.height * 0.55) * k }));
    await director.wait(ms + 80);
  }, [stage]);
  const click = useCallback(async (director: Director) => {
    setCursor((c) => ({ ...c, down: true }));
    await director.wait(170);
    setCursor((c) => ({ ...c, down: false }));
    await director.wait(180);
  }, []);
  const hide = useCallback(() => setCursor(hiddenCursor), []);
  return { cursor, setCursor, move, click, hide };
}

export function DemoCursor({ cursor }: { cursor: CursorState }) {
  return (
    <span aria-hidden="true" className={`sc-cursor${cursor.shown ? " is-shown" : ""}${cursor.down ? " is-down" : ""}`} style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)`, transitionDuration: `${cursor.ms * PACE}ms, 250ms` }}>
      <MousePointer2 />
      <i />
    </span>
  );
}
