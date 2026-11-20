import { useEffect, useRef } from "react";
import { SceneArtwork } from "./SceneArtwork";
import { subscribeScene } from "./scene-clock";
import "./scene.css";

const smooth = (a: number, b: number, value: number) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
const noise = (a: number, b: number) => { const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return n - Math.floor(n); };
const mix = (a: number[], b: number[], f: number) => a.map((v, i) => Math.round(v + ((b[i] ?? v) - v) * f));
const rgb = (v: number[]) => `rgb(${v.join(",")})`;
const alpha = (v: number[], a: number) => `rgba(${v.join(",")},${a})`;

export function SceneBackground({ arch = true, className = "" }: { arch?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const style = getComputedStyle(element);
    const color = (key: string) => { const hex = style.getPropertyValue(key).trim(); return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); };
    const palette = [0, 1, 2, 3].map(i => [0, 1, 2].map(j => color(`--scene-sky-${i}-${j}`)));
    const light = color("--scene-water-light"), deep = color("--scene-water-deep"), midNight = color("--scene-water-mid"), ember = color("--dm-starlight");
    const sea = element.querySelector<HTMLCanvasElement>(".seacv"), reflection = element.querySelector<HTMLCanvasElement>(".refl"), stars = element.querySelector<HTMLCanvasElement>(".scene-stars"), glitter = element.querySelector<HTMLCanvasElement>(".scene-glitter");
    const windows = element.querySelector<HTMLElement>(".win");
    if (windows) { for (let i = 0; i < 70; i++) { const w = document.createElement("i"); w.style.left = `${noise(i, 1) * 100}%`; w.style.bottom = `${4 + noise(i, 2) * 60}%`; windows.append(w); } }
    const canvasSize = (cv: HTMLCanvasElement) => { const w = Math.round(cv.clientWidth), h = Math.round(cv.clientHeight); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } return { w, h }; };
    let lastSea = -100;
    const paint = (elapsed: number, reduced: boolean) => {
      const t = reduced ? .7 : (elapsed % 46000) / 46000;
      let k: number, sun: number, dusk: number;
      if (t < .62) { k = smooth(.04, .62, t); sun = 1 - smooth(.02, .52, t); dusk = 1 - smooth(.46, .62, t); }
      else if (t < .84) { k = 1; sun = 0; dusk = 0; }
      else { const f = smooth(.84, 1, t); k = 1 - f; sun = 1; dusk = f; }
      const stops = [0, .35, .7, 1];
      let index = stops.findIndex((v, i) => i < 3 && k <= (stops[i + 1] ?? 1)); if (index < 0) index = 2;
      const start = stops[index] ?? 0, end = stops[index + 1] ?? 1;
      const a = palette[index] ?? [], b = palette[index + 1] ?? [];
      const c = [0, 1, 2].map(j => mix(a[j] ?? deep, b[j] ?? deep, (k - start) / (end - start)));
      element.style.background = `linear-gradient(180deg,${rgb(c[0] ?? deep)} 0%,${rgb(c[1] ?? deep)} 48%,${rgb(c[2] ?? deep)} 76%)`;
      element.style.setProperty("--sun", String(sun)); element.style.setProperty("--dusk", String(dusk)); element.style.setProperty("--night", String(1 - dusk));
      element.querySelectorAll<HTMLElement>(".strip").forEach((strip, i) => { strip.style.transform = `translateX(-${reduced ? 0 : elapsed / (i ? 80000 : 160000) % 1 * 50}%)`; });
      element.querySelectorAll<SVGElement>(".tree").forEach((tree, i) => { tree.style.transform = reduced ? "none" : `rotate(${Math.sin(elapsed / 4000 + i) * 1.6}deg)`; });
      element.querySelectorAll<HTMLElement>(".win i").forEach((w, i) => { w.style.opacity = String(reduced ? .55 : .1 + Math.max(0, Math.sin(elapsed / 1600 + i)) * .65); });
      const drawParticles = (cv: HTMLCanvasElement | null, beach: boolean) => {
        if (!cv) return; const x = cv.getContext("2d"); if (!x) return; const { w, h } = canvasSize(cv); x.clearRect(0, 0, w, h);
        x.fillStyle = rgb(ember);
        for (let i = 0; i < (beach ? 46 : 90); i++) {
          const rising = beach || i < 34; if (reduced && rising) continue;
          const p = (elapsed / (9000 + noise(i, 5) * 10000) + noise(i, 6)) % 1;
          const px = noise(i, 2) * w + (rising ? Math.sin(p * Math.PI * 2) * 30 : 0), py = rising ? h * (1 - p) : noise(i, 3) * h;
          x.globalAlpha = rising ? Math.sin(p * Math.PI) * .7 : .15 + noise(i, 7) * .55;
          const r = rising ? 1 + noise(i, 4) * 3 : .4 + noise(i, 4); x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
          if (beach && i % 3 === 0) { x.fillRect(px - r * 2, py, r * 4, .6); x.fillRect(px, py - r * 2, .6, r * 4); }
        } x.globalAlpha = 1;
      };
      drawParticles(stars, false); if (dusk > .01) drawParticles(glitter, true);
      if (dusk < .01 || elapsed - lastSea < 33 || !sea || !reflection) return;
      lastSea = elapsed; const x = sea.getContext("2d"), r = reflection.getContext("2d"); if (!x || !r) return;
      const { w: W, h: H } = canvasSize(sea); canvasSize(reflection); if (!W || !H) return;
      const hz = c[2] ?? deep, top = mix(hz, midNight, .45), middle = mix(mix(hz, midNight, .7), deep, 1 - sun);
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, rgb(top)); g.addColorStop(.35, rgb(middle)); g.addColorStop(1, rgb(deep)); x.fillStyle = g; x.fillRect(0, 0, W, H);
      const sx = W * (element.clientWidth < 640 ? .74 : .84), time = elapsed / 1000, rows = Math.round(H / 4);
      const haze = x.createLinearGradient(0, 0, 0, H * .14); haze.addColorStop(0, alpha(mix(hz, light, .35), .55 * (.3 + .7 * sun))); haze.addColorStop(1, alpha(light, 0)); x.fillStyle = haze; x.fillRect(0, 0, W, H * .14);
      x.globalCompositeOperation = "lighter";
      for (let i = 1; i < rows; i++) { const f = i / rows, y = Math.pow(f, 1.7) * H; x.fillStyle = alpha(light, (.035 + .05 * (1 - f)) * (.4 + .6 * sun)); for (let j = 0; j < 6 + f * 10; j++) { const n = noise(i, j), len = W * (.04 + .12 * n) * (.5 + f), px = ((n * W * 1.7 + time * (6 + f * 14) * (j % 2 ? 1 : -1)) % (W + len)) - len; x.fillRect(px, y, len, .6 + f * 1.4); } }
      r.clearRect(0, 0, W, H); r.globalCompositeOperation = "lighter";
      if (sun > .02) for (let i = 0; i < rows; i++) { const f = i / rows, y = Math.pow(f, 1.45) * H, width = (18 + f * W * .22) * (.55 + .45 * sun), ph = Math.floor(time * 5 + i * .37); for (let j = 0; j < 4; j++) { const n = noise(i * 3 + j, ph); if (n < .25) continue; const len = width * (.18 + .5 * noise(j * 7 + i, ph + 1)), off = (noise(i, j * 13 + ph) - .5) * width * 1.1; r.fillStyle = alpha(light, sun * Math.pow(1 - f, .9) * (.3 + .55 * n)); r.fillRect(sx + off - len / 2, y, len, 1 + f * 3.2); } }
      x.globalCompositeOperation = "source-over";
    };
    const unsubscribe = subscribeScene({ element, paint });
    return () => { unsubscribe(); windows?.replaceChildren(); };
  }, []);
  return <div ref={ref} className={`dm-scene ${className}`} aria-hidden="true"><SceneArtwork arch={arch} /></div>;
}
