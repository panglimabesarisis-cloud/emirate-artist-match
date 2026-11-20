import { useEffect, useState } from "react";

const words = ["Faster.", "Automatic.", "Secure.", "Easy.", "Happy."];
export function RotatingWord() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => { clearInterval(timer); setActive(0); if (!media.matches) timer = setInterval(() => setActive(i => (i + 1) % words.length), 3200); };
    start(); media.addEventListener("change", start);
    return () => { clearInterval(timer); media.removeEventListener("change", start); };
  }, []);
  return <span className="rotating-slot"><span className="sr-only">Faster.</span>{words.map((word, i) => <em key={word} aria-hidden="true" className={`rotating-word it ${i === active ? "is-active" : ""}`}>{word}</em>)}</span>;
}