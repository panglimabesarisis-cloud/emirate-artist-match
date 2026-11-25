import { useEffect, useRef, type HTMLAttributes } from "react";
import { approach, edgeDistance, edgePoint, perimeter } from "./light";

/** How far outside the box the pointer still steers the light, and how far the glitter can drift. */
const REACH = 140;
const GLITTER = { gold: ["255,246,226", "255,201,120", "240,170,60"], blue: ["238,244,255", "176,198,255", "92,132,255"] } as const;
type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; colour: string; star: boolean; phase: number };

/**
 * Two nested boxes: an outer shell that holds the glow and an opaque inner frame the light never enters.
 * A light runs along the frame's edge towards the pointer and sheds glitter outwards.
 */
export function LightBox({ tone = "gold", className = "", children, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: "gold" | "blue" }) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const colours = useRef<readonly string[]>(GLITTER[tone]);
  colours.current = GLITTER[tone];

  useEffect(() => {
    const box = root.current; const inner = frame.current; const sheet = canvas.current;
    if (!box || !inner || !sheet || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const paint = sheet.getContext("2d");
    const sparks: Spark[] = [];
    let size = { width: inner.offsetWidth, height: inner.offsetHeight };
    let at = size.width * 0.32; let target = at; let strength = 0.6; let wanted = 0.6;
    let pointed = 0; let running = false; let raf = 0; let last = 0; let due = 0;

    const resize = () => {
      size = { width: inner.offsetWidth, height: inner.offsetHeight };
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const margin = (sheet.offsetWidth - size.width) / 2;
      sheet.width = Math.max(1, Math.round(sheet.offsetWidth * ratio)); sheet.height = Math.max(1, Math.round(sheet.offsetHeight * ratio));
      paint?.setTransform(ratio, 0, 0, ratio, margin * ratio, margin * ratio); // drawing starts at the frame's corner
    };

    const pointer = (event: PointerEvent) => {
      const drawn = inner.getBoundingClientRect();
      if (!drawn.width) return;
      const k = size.width / drawn.width; // the panel may be scaled while it arrives
      const x = (event.clientX - drawn.left) * k; const y = (event.clientY - drawn.top) * k;
      const near = x > -REACH && y > -REACH && x < size.width + REACH && y < size.height + REACH;
      if (near) { target = edgeDistance(x, y, size); wanted = 1; pointed = performance.now(); }
      else wanted = 0.6;
    };

    // Glitter is born just outside the edge, mostly close to the light, and floats away from the box.
    const shed = () => {
      const along = at + (Math.random() - Math.random()) * Math.min(260, perimeter(size) / 6);
      const p = edgePoint(along, size);
      const out = 4 + Math.random() ** 2 * 70;
      const speed = 5 + Math.random() * 16;
      const palette = colours.current;
      sparks.push({
        x: p.x + p.outX * out + (Math.random() - 0.5) * 14, y: p.y + p.outY * out + (Math.random() - 0.5) * 14,
        vx: p.outX * speed + (Math.random() - 0.5) * 10, vy: p.outY * speed + (Math.random() - 0.5) * 10 - 3,
        age: 0, life: 0.9 + Math.random() * 1.8, size: 0.6 + Math.random() * 1.5,
        colour: palette[Math.floor(Math.random() * palette.length)]!, star: Math.random() < 0.14, phase: Math.random() * Math.PI * 2,
      });
    };

    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
      // Left alone, the light wanders slowly along the top edge.
      if (now - pointed > 3500) { target = size.width * (0.5 + 0.34 * Math.sin(now / 3800)); wanted = 0.6; }
      at = approach(at, target, 1 - Math.exp(-dt * 7), size);
      strength += (wanted - strength) * (1 - Math.exp(-dt * 5));
      const p = edgePoint(at, size);
      box.style.setProperty("--lx", `${p.x.toFixed(1)}px`);
      box.style.setProperty("--ly", `${p.y.toFixed(1)}px`);
      box.style.setProperty("--lk", strength.toFixed(3));
      if (paint) {
        due += dt * 46 * strength;
        while (due >= 1) { due -= 1; if (sparks.length < 110) shed(); }
        paint.save(); paint.setTransform(1, 0, 0, 1, 0, 0); paint.clearRect(0, 0, sheet.width, sheet.height); paint.restore();
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i]!;
          s.age += dt;
          if (s.age >= s.life) { sparks.splice(i, 1); continue; }
          s.x += s.vx * dt; s.y += s.vy * dt;
          const fade = Math.sin((s.age / s.life) * Math.PI);
          const twinkle = 0.55 + 0.45 * Math.sin(s.phase + s.age * 11);
          const alpha = Math.max(0, fade * twinkle * strength);
          paint.fillStyle = `rgba(${s.colour},${alpha.toFixed(3)})`;
          paint.beginPath(); paint.arc(s.x, s.y, s.size, 0, Math.PI * 2); paint.fill();
          if (s.star) { // a small four-point glint
            const long = s.size * 4.5 * twinkle;
            paint.fillRect(s.x - long, s.y - 0.4, long * 2, 0.8);
            paint.fillRect(s.x - 0.4, s.y - long, 0.8, long * 2);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    const watch = new IntersectionObserver(([entry]) => {
      const visible = !!entry?.isIntersecting;
      if (visible && !running) { running = true; last = performance.now(); resize(); raf = requestAnimationFrame(tick); }
      else if (!visible) { running = false; cancelAnimationFrame(raf); }
    });
    const sizes = new ResizeObserver(resize);
    watch.observe(box); sizes.observe(inner);
    window.addEventListener("pointermove", pointer, { passive: true });
    return () => { running = false; cancelAnimationFrame(raf); watch.disconnect(); sizes.disconnect(); window.removeEventListener("pointermove", pointer); };
  }, []);

  return (
    <div {...rest} ref={root} className={`sc-light sc-light-${tone}`}>
      <span aria-hidden="true" className="sc-light-shell"><i /></span>
      <span aria-hidden="true" className="sc-light-halo"><i /></span>
      <canvas aria-hidden="true" ref={canvas} className="sc-light-dust" />
      <div ref={frame} className={`sc-light-frame ${className}`}>{children}</div>
      <span aria-hidden="true" className="sc-light-line"><i /></span>
    </div>
  );
}
