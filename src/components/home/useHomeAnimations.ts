import { useEffect, type RefObject } from "react";
import { useI18n } from "@/lib/i18n";

// All DOM animation effects are scoped to this page and disposed on navigation.
export function useHomeAnimations(ref: RefObject<HTMLDivElement | null>) {
  const { t, lang } = useI18n();
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let dispose = () => {};
    const setup = () => {
      dispose();
      const cleanups: (() => void)[] = [];
      const timers = new Set<ReturnType<typeof setTimeout>>();
      const later = (fn: () => void, ms: number) => { const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms); timers.add(timer); };
      const reduced = media.matches;
      root.querySelectorAll<HTMLElement>(".rv").forEach((el) => { if (reduced) el.classList.add("in"); });
      if (!reduced) {
        const reveal = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("in"); reveal.unobserve(entry.target); } }), { threshold: 0.12 });
        root.querySelectorAll(".rv").forEach((el) => reveal.observe(el));
        cleanups.push(() => reveal.disconnect());
      }
      const stories = Array.from(root.querySelectorAll<HTMLElement>(".story"));
      stories.forEach((s) => s.querySelectorAll<HTMLElement>(".es").forEach((el, i) => el.style.setProperty("--i", String(i))));
      let scrollFrame = 0;
      const updateStories = () => {
        scrollFrame = 0;
        stories.forEach((section) => {
          const list = section.querySelector<HTMLElement>(".esc-steps");
          if (!list) return;
          const rect = list.getBoundingClientRect();
          const steps = Array.from(list.querySelectorAll<HTMLElement>(".es"));
          const progress = Math.max(0, Math.min(1, (innerHeight * .55 - rect.top) / rect.height));
          const fill = section.querySelector<HTMLElement>(".track i");
          const coin = section.querySelector<HTMLElement>(".coin");
          if (fill) fill.style.height = `${progress * (rect.height - 20)}px`;
          if (coin) coin.style.top = `${progress * (rect.height - 20)}px`;
          let current = -1;
          steps.forEach((step, i) => { const lit = reduced || step.getBoundingClientRect().top < innerHeight * .78; step.classList.toggle("lit", lit); if (lit) current = i; });
          steps.forEach((step, i) => step.classList.toggle("past", !reduced && i < current));
          const states: string[] = JSON.parse(section.dataset["states"] ?? "[]");
          const status = section.querySelector<HTMLElement>(".v-st");
          if (status) status.textContent = current < 0 ? section.dataset["idle"] ?? "" : states[current] ?? "";
          const bar = section.querySelector<HTMLElement>(".v-bar i");
          if (bar) bar.style.width = `${(current + 1) / steps.length * 100}%`;
          section.dataset["step"] = String(current);
        });
      };
      const onScroll = () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateStories); };
      updateStories();
      window.addEventListener("scroll", onScroll, { passive: true }); window.addEventListener("resize", onScroll);
      cleanups.push(() => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(scrollFrame); });

      const duo = root.querySelector<HTMLElement>(".duo");
      if (duo) {
        const notes = Array.from(duo.querySelectorAll<HTMLElement>(".notes li"));
        let running = false;
        const play = () => {
          notes.forEach((n) => n.classList.remove("in", "hot"));
          if (reduced) { notes.forEach((n) => n.classList.add("in")); return; }
          notes.forEach((n, i) => later(() => { n.classList.add("in", "hot"); later(() => n.classList.remove("hot"), 900); }, 1200 + i * 900));
          later(() => { if (running) play(); }, 10500);
        };
        if (reduced) play();
        else {
          const observer = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting && !running) { running = true; play(); } else if (!e.isIntersecting) { running = false; timers.forEach(clearTimeout); timers.clear(); } }), { threshold: .35 });
          observer.observe(duo); cleanups.push(() => observer.disconnect());
        }
      }
      const canvas = root.querySelector<HTMLCanvasElement>(".home-sky");
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        let frame = 0;
        let width = 0; let height = 0;
        let particles: { x: number; y: number; r: number; v: number; a: number }[] = [];
        const color = getComputedStyle(root).getPropertyValue("--dm-starlight").trim();
        const draw = () => {
          ctx.clearRect(0, 0, width, height);
          ctx.fillStyle = color;
          for (const p of particles) { if (!reduced) { p.y -= p.v; p.a += .02; if (p.y < -10) p.y = height + 10; } ctx.globalAlpha = .35 + Math.sin(p.a) * .3; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
          ctx.globalAlpha = 1;
          if (!reduced) frame = requestAnimationFrame(draw);
        };
        const size = () => { cancelAnimationFrame(frame); width = canvas.clientWidth; height = canvas.clientHeight; const dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = width * dpr; canvas.height = height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); particles = Array.from({ length: Math.round(width / 14) }, () => ({ x: Math.random() * width, y: Math.random() * height, r: Math.random() * 1.6 + .3, v: Math.random() * .25 + .05, a: Math.random() * Math.PI * 2 })); draw(); };
        size(); window.addEventListener("resize", size); cleanups.push(() => { cancelAnimationFrame(frame); window.removeEventListener("resize", size); });
      }
      if (!reduced && matchMedia("(hover:hover) and (pointer:fine)").matches) root.querySelectorAll<HTMLElement>(".fc").forEach((card) => {
        const move = (e: MouseEvent) => { const r = card.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width; const y = (e.clientY - r.top) / r.height; card.classList.add("tilt"); card.style.setProperty("--ry", `${(x - .5) * 14}deg`); card.style.setProperty("--rx", `${(.5 - y) * 12}deg`); card.style.setProperty("--gx", `${x * 100}%`); card.style.setProperty("--gy", `${y * 100}%`); card.style.setProperty("--px", `${(x - .5) * -26}px`); card.style.setProperty("--py", `${(y - .5) * -20}px`); };
        const leave = () => { card.classList.remove("tilt"); ["--ry", "--rx", "--px", "--py"].forEach((key) => card.style.removeProperty(key)); };
        card.addEventListener("mousemove", move); card.addEventListener("mouseleave", leave); cleanups.push(() => { leave(); card.removeEventListener("mousemove", move); card.removeEventListener("mouseleave", leave); });
      });
      dispose = () => { timers.forEach(clearTimeout); timers.clear(); cleanups.forEach((c) => c()); };
    };
    setup(); media.addEventListener("change", setup);
    return () => { dispose(); media.removeEventListener("change", setup); };
  }, [ref, lang, t]);
}