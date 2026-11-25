import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/lib/i18n";
import { splitHeading } from "./scroll";

/** How long the page must rest before the line bursts. */
export const STILL_FOR = 4000;
const SPARKS = Array.from({ length: 26 }, (_, i) => ({
  "--x": `${30 + ((i * 37) % 41)}%`, "--dx": `${(((i * 53) % 21) - 10) * 22}px`, "--dy": `${(((i * 29) % 15) - 7) * 13}px`, "--d": `${(i % 7) * 45}ms`,
}) as CSSProperties);

/**
 * "Stop Scrolling and Watch": stays while the visitor scrolls. After the page has rested for four seconds with the
 * line on screen, it blurs, breaks apart into light and disappears. Scrolling again brings it back.
 */
export function StopAndWatch({ active = true }: { active?: boolean }) {
  const { t } = useI18n();
  const line = useRef<HTMLParagraphElement>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const node = line.current;
    setGone(false);
    if (!node || !active) return;
    let visible = false; let timer = 0; let lastY = window.scrollY;
    const rest = () => { window.clearTimeout(timer); if (visible) timer = window.setTimeout(() => setGone(true), STILL_FOR); };
    const observer = new IntersectionObserver(([entry]) => {
      const shown = (entry?.intersectionRatio ?? 0) >= 0.59;
      if (shown === visible) return;
      visible = shown;
      if (!shown) setGone(false);
      rest();
    }, { threshold: [0, 0.6] });
    // Only the page counts as scrolling: the message lists inside the demos scroll on their own.
    const scrolled = () => { if (window.scrollY === lastY) return; lastY = window.scrollY; setGone(false); rest(); };
    observer.observe(node);
    window.addEventListener("scroll", scrolled, { passive: true });
    return () => { window.clearTimeout(timer); observer.disconnect(); window.removeEventListener("scroll", scrolled); };
  }, [active]);

  const text = t("Stop Scrolling and Watch");
  const words = splitHeading(text);
  let index = 0;
  return (
    <p ref={line} className={`sc-stop serif${gone ? " is-gone" : ""}`}>
      <span className="sr-only">{text}</span>
      <span className="sc-stop-words" aria-hidden="true">
        {words.map((letters, w) => (
          <span className="sc-stop-word" key={w}>
            {letters.map((letter) => {
              const i = index++;
              const style = { "--dx": `${(((i * 41) % 13) - 6) * 14}px`, "--dy": `${(((i * 23) % 11) - 5) * 12}px`, "--r": `${(((i * 17) % 9) - 4) * 24}deg`, "--d": `${((i * 31) % 10) * 28}ms` } as CSSProperties;
              return <i key={i} style={style}>{letter}</i>;
            })}
          </span>
        ))}
      </span>
      <span className="sc-stop-flash" aria-hidden="true" />
      {SPARKS.map((style, i) => <b key={i} className="sc-stop-spark" aria-hidden="true" style={style} />)}
    </p>
  );
}
