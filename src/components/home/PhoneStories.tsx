import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ChevronLeft, ChevronRight, Pause, Play, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { phoneStories } from "./phone-stories";
import "./phone-stories.css";

export function PhoneStories() {
  const { t, lang } = useI18n();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const clock = useRef<gsap.core.Timeline | null>(null);
  const story = phoneStories[index] ?? phoneStories[0];
  const stopped = paused || hovered || focused || !visible || !pageVisible || reduced;

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(media.matches);
    const visibility = () => setPageVisible(!document.hidden);
    motion(); visibility();
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), { threshold: 0.15 });
    observer.observe(element);
    return () => { observer.disconnect(); media.removeEventListener("change", motion); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const context = gsap.context(() => {
      const items = element.querySelectorAll(".phone-message");
      const result = element.querySelector(".phone-outcome");
      const scene = element.querySelector(".phone-story-body");
      const progress = element.querySelector(".phone-progress-fill");
      if (reduced) {
        gsap.set([scene, ...items, result], { autoAlpha: 1, y: 0, scale: 1 });
        gsap.set(progress, { scaleX: 1 });
        return;
      }
      gsap.set(items, { autoAlpha: 0, y: 12 });
      gsap.set(result, { autoAlpha: 0, y: 10, scale: 0.96 });
      gsap.set(progress, { scaleX: 0 });
      const duration = items.length * 1.5 + 3.8;
      const timeline = gsap.timeline({ paused: true, defaults: { ease: "power3.out" }, onComplete: () => setIndex((current) => (current + 1) % phoneStories.length) });
      timeline.fromTo(scene, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 0);
      items.forEach((item, i) => timeline.to(item, { autoAlpha: 1, y: 0, duration: 0.55 }, 0.6 + i * 1.5));
      timeline.to(result, { autoAlpha: 1, y: 0, scale: 1, duration: 0.65 }, items.length * 1.5 + 0.4);
      timeline.to(progress, { scaleX: 1, duration, ease: "none" }, 0);
      timeline.to(scene, { autoAlpha: 0, y: -6, duration: 0.3 }, duration - 0.3);
      clock.current = timeline;
    }, element);
    return () => { clock.current = null; context.revert(); };
  }, [index, reduced, lang]);

  useEffect(() => { if (stopped) clock.current?.pause(); else clock.current?.play(); }, [stopped, index, reduced, lang]);

  if (!story) return null;
  const Icon = story.icon;
  const go = (direction: number) => setIndex((current) => (current + direction + phoneStories.length) % phoneStories.length);
  return <div ref={root} className={`pane pane-a phone-stories${index === 4 ? " phone-solution" : ""}`} role="region" aria-roledescription={t("carousel")} aria-label={t("Your phone today")}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); go(event.key === "ArrowRight" ? 1 : -1); } }}>
    <div className="pane-h"><span>{t(index === 4 ? "Your phone with Dealmaker" : "Your phone today")}</span><span className="phone-example">{t("Illustrative story")}</span></div>
    <div className="phone-story-heading"><div className="phone-story-symbol" aria-hidden="true"><Icon /></div><div><h3>{t(story.title)}</h3><p>{t(story.detail)}</p></div><span className="phone-story-number">{index + 1} / 5</span></div>
    <div className="phone-progress" aria-hidden="true"><span className="phone-progress-fill" /></div>
    <div className="phone-story-body" role="group" aria-roledescription={t("slide")} aria-label={`${index + 1} / 5: ${t(story.title)}`}>
      <div className="phone-contact"><MessageCircle aria-hidden="true" /><span>{t(story.person)}</span></div>
      <ol className="phone-thread">{story.messages.map((message, i) => <li className={`phone-message${message.me ? " phone-message-me" : ""}`} key={`${index}-${i}`}><span>{t(message.text)}</span><small>{t(message.time)}</small></li>)}</ol>
      <div className="phone-outcome"><strong><Icon aria-hidden="true" />{t(story.outcome)}</strong><p>{t(story.caption)}</p></div>
    </div>
    <div className="phone-controls">
      <Button variant="ghost" size="icon" className="phone-control" aria-label={t("Previous story")} title={t("Previous story")} onClick={() => go(-1)}><ChevronLeft /></Button>
      <div className="phone-selectors">{phoneStories.map((slide, i) => <Button variant="ghost" size="icon" key={slide.title} className={`phone-selector${i === index ? " is-current" : ""}`} aria-label={`${i + 1}: ${t(slide.title)}`} aria-current={i === index ? "step" : undefined} title={t(slide.title)} onClick={() => setIndex(i)}><span>{i + 1}</span></Button>)}</div>
      <Button variant="ghost" size="icon" className="phone-control" aria-label={t("Next story")} title={t("Next story")} onClick={() => go(1)}><ChevronRight /></Button>
      <Button variant="ghost" size="icon" className="phone-control phone-play" disabled={reduced} aria-label={t(paused || reduced ? "Play stories" : "Pause stories")} title={t(paused || reduced ? "Play stories" : "Pause stories")} onClick={() => setPaused((value) => !value)}>{paused || reduced ? <Play /> : <Pause />}</Button>
    </div>
  </div>;
}