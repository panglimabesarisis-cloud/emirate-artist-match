import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useReducedMotion } from "./demo";
import { introProgress, introStages, splitHeading } from "./scroll";
import { createDust, touchProgress } from "./dust";

/**
 * A pinned, scroll-driven opening. Scrolling down flies the heading letters in, types the sentence below it,
 * then brings the panel up (tilted into place, or zoomed in). Scrolling back up reverses it.
 * `onReady` tells the demo inside the panel when it has fully arrived.
 */
export function ScrollIntro({ id, title, accent, text, effect, oneLine = false, teaser, onReady, children }: {
  id: string; title: string; accent: string; text: string; effect: "tilt" | "zoom"; oneLine?: boolean;
  /** Two halves of a large line that slide in from the sides before the panel covers them. */
  teaser?: [string, string]; onReady: (ready: boolean) => void; children: ReactNode;
}) {
  const teased = !!teaser;
  const track = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLParagraphElement>(null);
  const grains = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const [typed, setTyped] = useState(0);
  const [ready, setReady] = useState(false);
  const report = useRef(onReady);
  report.current = onReady;

  useEffect(() => { report.current(ready || reduced); }, [ready, reduced]);

  useEffect(() => {
    const root = track.current; const body = content.current; const top = head.current; const box = panel.current;
    if (!root || !body || !top || !box) return;
    if (reduced) {
      root.style.height = ""; body.style.transform = ""; top.style.opacity = "";
      ["--title", "--rise", "--fit", "--teaser"].forEach((name) => root.style.removeProperty(name));
      setTyped(text.length);
      return;
    }
    let frame = 0;
    const dust = line.current && grains.current ? createDust(line.current, grains.current) : null;
    const update = () => {
      frame = 0;
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--site-header-height")) || 0;
      const view = Math.max(320, window.innerHeight - header);
      root.style.height = `${Math.round(view * (teased ? 4.4 : 3.4))}px`;
      root.style.setProperty("--pin-top", `${header}px`);
      root.style.setProperty("--pin-height", `${view}px`);
      const rect = root.getBoundingClientRect();
      const stage = introStages(introProgress({ top: rect.top, height: rect.height, header, view }), text.length, teased);
      root.style.setProperty("--teaser", stage.teaser.toFixed(4));
      const rise = 1 - (1 - stage.rise) ** 2;
      // The panel shrinks to fit short screens, and the heading moves up to make room as it arrives.
      const fit = Math.min(1, (view - 16) / Math.max(1, box.offsetHeight));
      const overflow = Math.max(0, (box.parentElement?.offsetTop ?? 0) + box.offsetHeight * fit + 12 - view);
      root.style.setProperty("--title", stage.title.toFixed(4));
      root.style.setProperty("--rise", rise.toFixed(4));
      root.style.setProperty("--fit", fit.toFixed(4));
      body.style.transform = `translateY(${-overflow * rise}px)`;
      top.style.opacity = String(1 - rise * Math.min(1, overflow / Math.max(1, top.offsetHeight)) * 0.7);
      setTyped(stage.typed);
      if (dust && line.current) {
        // Measured as drawn: the words crumble from the moment the arriving panel reaches them.
        const words = line.current.getBoundingClientRect();
        dust.draw(stage.teaser < 0.99 || stage.rise <= 0 ? 0 : touchProgress(box.getBoundingClientRect().top, words.top, words.bottom));
      }
      setReady(stage.ready);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    document.addEventListener("scroll", schedule, { passive: true, capture: true });
    const resized = () => { dust?.reset(); schedule(); };
    window.addEventListener("resize", resized);
    void document.fonts?.ready.then(resized);
    const observer = new ResizeObserver(schedule);
    observer.observe(box);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener("scroll", schedule, { capture: true }); window.removeEventListener("resize", resized); dust?.reset(); };
  }, [reduced, text, teased]);

  const lines = [splitHeading(title), splitHeading(accent)];
  const count = lines.flat(2).length;
  let index = 0;
  return (
    <div ref={track} className={`sc-track is-${effect}${reduced ? " is-still" : ""}${ready || reduced ? " is-ready" : ""}`}>
      <div className="sc-pin">
        <div ref={content} className="sc-pin-content">
          <header ref={head} className="sc-head sc-intro wrap">
            <h2 className={`serif${oneLine ? " is-one-line" : ""}`} id={id} aria-label={`${title} ${accent}`}>
              {lines.map((words, line) => (
                <span key={line} aria-hidden="true" className={`sc-line${line ? " it-line" : ""}`}>
                  {words.map((letters, w) => (
                    <span className="sc-word" key={w}>
                      {letters.map((letter) => {
                        const i = index++;
                        const side = i % 3;
                        const style = {
                          "--fx": side === 1 ? "-55vw" : side === 2 ? "55vw" : "0px",
                          "--fy": side === 0 ? "-60vh" : `${(i % 2 ? 1 : -1) * 46}px`,
                          "--at": (i / Math.max(1, count) * 0.55).toFixed(4),
                        } as CSSProperties;
                        return <span key={i} className="sc-fly" style={style}>{letter}</span>;
                      })}
                    </span>
                  ))}
                </span>
              ))}
            </h2>
            <p><span>{text.slice(0, typed)}</span>{typed > 0 && typed < text.length && <i className="sc-caret" aria-hidden="true" />}<span className="sc-untyped">{text.slice(typed)}</span></p>
          </header>
          <div className="sc-rise-stage wrap">
            {teaser && <p ref={line} className="sc-teaser serif" aria-hidden="true"><span className="from-left">{teaser[0]}</span> <span className="from-right">{teaser[1]}</span></p>}
            {teaser && <canvas ref={grains} className="sc-dust" aria-hidden="true" />}
            <div ref={panel} className="sc-rise">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
