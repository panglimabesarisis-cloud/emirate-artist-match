/** Turns a line of DOM text into drifting dust, driven by a 0..1 progress (so scrolling back rebuilds it). */

type Grain = { x: number; y: number; dx: number; dy: number; delay: number; size: number; colour: string; swirl: number };
const SPREAD = 170; // room around the text for the dust to drift into

/** 0 until the panel's top edge reaches the bottom of the text, 1 once it has pushed well past it. */
export function touchProgress(panelTop: number, textTop: number, textBottom: number) {
  const reach = Math.max(1, (textBottom - textTop) * 1.7);
  return Math.min(1, Math.max(0, (textBottom - panelTop) / reach));
}

/** Where one grain is at `progress`: how far along its own flight, and how visible it still is. */
export function grainAt(progress: number, delay: number) {
  const flight = Math.min(1, Math.max(0, (progress - delay) / (1 - delay)));
  return { flight, alpha: 1 - flight ** 1.6 };
}

export function createDust(source: HTMLElement, canvas: HTMLCanvasElement) {
  let grains: Grain[] = [];
  let key = "";
  const paint = canvas.getContext("2d");

  // Draws the words as they are on screen into a scratch canvas and keeps one grain for every few lit pixels.
  const sample = () => {
    const base = source.getBoundingClientRect();
    const words = Array.from(source.querySelectorAll<HTMLElement>(":scope > span"));
    if (!paint || !base.width) return false;
    const next = `${Math.round(base.width)}x${Math.round(base.height)}:${source.textContent}`;
    if (next === key) return grains.length > 0;
    const scale = base.width / Math.max(1, source.offsetWidth); // the stage may be scaled
    const width = Math.ceil(source.offsetWidth + SPREAD * 2); const height = Math.ceil(source.offsetHeight + SPREAD * 2);
    const scratch = document.createElement("canvas");
    scratch.width = width; scratch.height = height;
    const draw = scratch.getContext("2d", { willReadFrequently: true });
    if (!draw) return false;
    for (const word of words) {
      const style = getComputedStyle(word); const box = word.getBoundingClientRect();
      draw.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      draw.textAlign = "center"; draw.textBaseline = "middle"; draw.fillStyle = style.color;
      const text = style.textTransform === "uppercase" ? (word.textContent ?? "").toUpperCase() : word.textContent ?? "";
      draw.fillText(text, SPREAD + (box.left - base.left + box.width / 2) / scale, SPREAD + (box.top - base.top + box.height / 2) / scale);
    }
    const pixels = draw.getImageData(0, 0, width, height).data;
    const step = Math.max(3, Math.round(Math.sqrt((source.offsetWidth * source.offsetHeight) / 9000)));
    grains = [];
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const at = (y * width + x) * 4;
        if (pixels[at + 3]! < 130) continue;
        const low = Math.max(0, Math.min(1, (y - SPREAD) / Math.max(1, source.offsetHeight)));
        grains.push({
          x, y, size: step * (0.55 + Math.random() * 0.55),
          dx: (Math.random() - 0.35) * 170, dy: -30 - Math.random() * 130,
          delay: (1 - low) * 0.3 + Math.random() * 0.25, // the touched lower edge crumbles first
          colour: `rgb(${pixels[at]},${pixels[at + 1]},${pixels[at + 2]})`, swirl: Math.random() * Math.PI * 2,
        });
      }
    }
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * ratio; canvas.height = height * ratio;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    canvas.style.left = `${source.offsetLeft - SPREAD}px`; canvas.style.top = `${source.offsetTop - SPREAD}px`;
    paint.setTransform(ratio, 0, 0, ratio, 0, 0);
    key = next;
    return grains.length > 0;
  };

  const clear = () => { paint?.save(); paint?.setTransform(1, 0, 0, 1, 0, 0); paint?.clearRect(0, 0, canvas.width, canvas.height); paint?.restore(); };

  return {
    draw(progress: number) {
      if (progress <= 0 || !sample() || !paint) { source.style.visibility = ""; clear(); return; }
      source.style.visibility = "hidden";
      clear();
      if (progress >= 1) return;
      for (const grain of grains) {
        const { flight, alpha } = grainAt(progress, grain.delay);
        if (alpha <= 0.02) continue;
        const drift = Math.sin(grain.swirl + flight * 6) * 16 * flight;
        paint.globalAlpha = alpha;
        paint.fillStyle = grain.colour;
        const size = grain.size * (1 - flight * 0.65);
        paint.fillRect(grain.x + grain.dx * flight ** 1.3 + drift, grain.y + grain.dy * flight ** 1.5, size, size);
      }
      paint.globalAlpha = 1;
    },
    /** Forget the sampled words, for example after the screen changed size. */
    reset() { key = ""; grains = []; source.style.visibility = ""; clear(); },
  };
}
