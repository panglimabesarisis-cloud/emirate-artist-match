import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const samples = [
  { quote: "I can focus on the performance, while my booking desk takes care of the enquiries.", name: "Sample singer", initials: "S" },
  { quote: "One profile, one booking link, and more time to prepare for the next event.", name: "Sample DJ", initials: "DJ" },
  { quote: "Having my event details in one place makes every booking feel more organised.", name: "Sample entertainer", initials: "E" },
];
export function SampleTestimonials() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => { clearInterval(timer); if (!paused && !media.matches) timer = setInterval(() => setIndex(i => (i + 1) % samples.length), 6500); };
    start(); media.addEventListener("change", start);
    return () => { clearInterval(timer); media.removeEventListener("change", start); };
  }, [paused]);
  const sample = samples[index];
  if (!sample) return null;
  return <section className="reference-testimonial reference-wrap" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false); }}>
    <span className="reference-eyebrow">Artist stories</span><h2>A little less admin.<br /><em className="reference-gradient-text">A lot more stage.</em></h2>
    <div className="reference-testimonial-slide"><div><span className="reference-sample">Sample · illustrative testimonial</span><q className="mt-6">{sample.quote}</q><p>{sample.name} · UAE</p></div><div className="reference-testimonial-avatar" aria-hidden="true">{sample.initials}</div></div>
    <div className="reference-testimonial-controls"><div className="reference-testimonial-dots">{samples.map((s, i) => <Button key={s.name} variant="ghost" className={i === index ? "active" : ""} aria-label={`Show sample testimonial ${i + 1}`} aria-pressed={i === index} onClick={() => setIndex(i)} />)}</div><div className="flex gap-3"><Button variant="outline" size="icon" aria-label="Previous sample testimonial" onClick={() => setIndex(i => (i + samples.length - 1) % samples.length)}><ArrowLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" aria-label="Next sample testimonial" onClick={() => setIndex(i => (i + 1) % samples.length)}><ArrowRight className="h-4 w-4" /></Button></div></div>
  </section>;
}