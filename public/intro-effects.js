/* Changes drawn over the intro: the sentences in the ring, the booking chain, the flying title, and the finale that
   types, turns to dust and opens the website. */
(() => {
  const TITLE = "AGENTIC AI AUTOMATION";
  const TAGLINE = "We make a deal just for money";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (n) => Math.min(1, Math.max(0, n));
  const between = (n, from, to) => clamp((n - from) / (to - from));
  const out = (n) => 1 - Math.pow(1 - n, 3);
  const into = (n) => n * n * n;

  // Finale times, in seconds after the name is on screen.
  const TYPE_FROM = 0.5, PER_LETTER = 0.08, HOLD = 3;
  const DUST_FROM = TYPE_FROM + TAGLINE.length * PER_LETTER + HOLD;
  const DUST_FOR = 1.6;
  const ENTER_AT = DUST_FROM + 2.6;
  const QUIET_FROM = 2.4; // the music starts to fade here and is silent just before the website opens

  /* The scroll is longer than the original film. Each entry plays [original from, original to] over its own
     length of scroll; the same from and to makes the film rest at that moment. */
  const SENTENCES = [3.1, 3.1, 15], MORPH = [3.3, 4.05, 4], STAR = [5.15, 6.2, 3], LIGHT = [9.95, 11.03, 3], NODES = [14.6, 18.1, 6.5], CHAIN = [18.2, 18.2, 10];
  const PARTS = [SENTENCES, MORPH, STAR, LIGHT, NODES, CHAIN];
  const extra = ([from, to, length]) => length - (to - from);
  const beforeChain = PARTS.slice(0, -1).reduce((sum, part) => sum + extra(part), 0);
  let chain = 0; // how far the booking chain has come
  let told = 0; // the scroll position, in film units
  window.__dmTime = (scrolled) => {
    told = scrolled;
    chain = Math.min(CHAIN[2], Math.max(0, scrolled - CHAIN[0] - beforeChain));
    let added = 0;
    for (const part of PARTS) {
      const [from, to, length] = part, start = from + added;
      if (scrolled <= start) break;
      if (scrolled < start + length) return from + (to - from) * ((scrolled - start) / length);
      added += extra(part);
    }
    return scrolled - added;
  };

  const style = document.createElement("style");
  style.textContent = `
    .dm-t-focus{font-size:min(calc(min(100vw,60vh)*0.058),5.4vw)!important}
    .dm-t-ring{white-space:pre!important;text-align:center;line-height:1.3;font-size:calc(min(100vw,60vh)*0.052)!important}
    .dmfx-words{z-index:4;width:100%;height:100%}
    .dm-logo>.dm-logo-base{background:none!important;color:#fff!important;text-shadow:0 0 16px rgba(255,255,255,.28)}
    .dm-logo>.dm-logo-glow,.dm-logo>.dm-logo-sweep{display:none!important}
    .dmfx-name{z-index:4}
    .dmfx-name>*{position:absolute;left:0;top:0;transform:translate(-50%,-50%)}
    .dmfx-name>b{font:400 100px Anton,Impact,sans-serif;letter-spacing:.04em;line-height:1.2;white-space:nowrap;color:#fff;text-shadow:0 0 18px rgba(255,255,255,.35)}
    .dmfx-name>i{background:linear-gradient(90deg,#ffb648,#fff3d6 50%,#ffb648);box-shadow:0 0 18px rgba(255,170,60,.8)}
    .dmfx-name>u{border-radius:50%;background:radial-gradient(closest-side,#fff,rgba(255,255,255,.85) 22%,rgba(255,240,215,.35) 50%,transparent)}
    .dm-bg>.dmfx-photo{position:absolute;inset:0;background:#0e0f19 url(/intro-bg.webp) center 48%/cover no-repeat}
    .dmfx{position:fixed;inset:0;pointer-events:none;visibility:hidden}
    .dmfx-title{z-index:4;display:flex;align-items:center;justify-content:center;white-space:pre;font-family:Anton,Impact,sans-serif;line-height:1.1;letter-spacing:.04em;color:#fff6ea;text-shadow:0 0 18px rgba(255,120,20,.75),0 2px 10px rgba(0,0,0,.55)}
    .dmfx-title span{display:inline-block;will-change:transform,opacity}
    .dm-logo>.dmfx-type{position:absolute;left:50%;top:calc(100% + .7em);transform:translateX(-50%);font-family:Anton,Impact,sans-serif;font-size:.3em;line-height:1.2;letter-spacing:.1em;white-space:pre;color:#fff3e4;text-shadow:0 0 12px rgba(255,120,20,.8)}
    .dmfx-type span{position:relative;visibility:hidden}
    .dmfx-type span.on{visibility:inherit}
    .dmfx-type span.caret::after{content:"";position:absolute;right:-.14em;top:.08em;bottom:.08em;width:.07em;background:#ffb45a}
    .dmfx-dark{z-index:4;background:#000}
    .dmfx-dust{z-index:4;width:100%;height:100%}
    .dmfx-ending .dmx,.dmfx-ending [class*="dm-cursor"]{opacity:0!important;pointer-events:none;transition:opacity .4s}
  `;
  document.head.append(style);

  const add = (tag, className) => {
    const el = document.createElement(tag);
    el.className = `dmfx ${className}`;
    el.setAttribute("aria-hidden", "true");
    document.body.append(el);
    return el;
  };
  const title = add("div", "dmfx-title");
  const dark = add("div", "dmfx-dark");
  const dust = add("canvas", "dmfx-dust");

  const spell = (text, parent) => [...text].map((character) => {
    const span = document.createElement("span");
    span.textContent = character;
    parent.append(span);
    return span;
  });
  const letters = spell(TITLE, title);

  const show = (el, on) => { el.style.visibility = on ? "visible" : "hidden"; };

  let fitted = "";
  function drawTitle(frame, size) {
    const t = frame.T;
    const on = t > 23.9 && t < 27.6;
    show(title, on);
    if (!on) return;
    // One line, as large as the screen allows.
    const key = `${size.W}x${size.H}`;
    if (key !== fitted && document.fonts?.status !== "loading") {
      title.style.fontSize = "100px";
      const width = letters.reduce((sum, span) => sum + span.offsetWidth, 0);
      if (width) {
        title.style.fontSize = `${Math.min((size.W * 0.9 * 100) / width, size.H * 0.17, 140)}px`;
        fitted = key;
      }
    }
    title.style.transform = `translateY(${size.cy - size.H / 2}px) scale(${1 + 0.35 * into(between(t, 27.0, 27.6))})`;
    title.style.opacity = String(1 - between(t, 27.05, 27.5));
    const far = Math.max(size.W, size.H) * 0.8;
    letters.forEach((span, i) => {
      // Neighbouring letters come from very different sides: left, right, top, below and the corners.
      const angle = i * 2.39996;
      const delay = (((i * 8) % letters.length) / letters.length) * 0.75;
      const p = reduced ? between(t, 24.0, 24.6) : out(between(t, 24.0 + delay, 24.9 + delay));
      const rest = reduced ? 0 : 1 - p;
      span.style.opacity = String(clamp(p * 1.6));
      span.style.transform = `translate(${Math.cos(angle) * far * rest}px,${Math.sin(angle) * far * rest}px) rotate(${(i % 2 ? 1 : -1) * 220 * rest}deg) scale(${1 + 2 * rest})`;
    });
  }

  /* Reads the words where they stand on screen and returns them as specks of dust. */
  function crumble(elements, size) {
    const sheet = document.createElement("canvas");
    sheet.width = size.W; sheet.height = size.H;
    const draw = sheet.getContext("2d", { willReadFrequently: true });
    let left = size.W, top = size.H, right = 0, bottom = 0;
    elements.forEach(({ element, colours }) => {
      const look = window.getComputedStyle(element);
      draw.font = `${look.fontSize} Anton, Impact, sans-serif`;
      const metrics = draw.measureText("H");
      const ascent = metrics.fontBoundingBoxAscent, descent = metrics.fontBoundingBoxDescent;
      const box = element.getBoundingClientRect();
      const paint = draw.createLinearGradient(box.left, 0, box.right, 0);
      colours.forEach((colour, i) => paint.addColorStop(i / (colours.length - 1), colour));
      draw.fillStyle = paint;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (let i = 0; i < node.length; i++) {
          range.setStart(node, i); range.setEnd(node, i + 1);
          const r = range.getBoundingClientRect();
          draw.fillText(node.data[i], r.left, r.top + (r.height - ascent - descent) / 2 + ascent);
          left = Math.min(left, r.left); right = Math.max(right, r.right);
          top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom);
        }
      }
    });
    left = Math.max(0, Math.floor(left)); top = Math.max(0, Math.floor(top));
    const width = Math.min(size.W, Math.ceil(right)) - left, height = Math.min(size.H, Math.ceil(bottom)) - top;
    if (width <= 0 || height <= 0) return [];
    const pixels = draw.getImageData(left, top, width, height).data;
    const step = Math.max(2, Math.round(Math.sqrt((width * height) / 14000)));
    const specks = [];
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        if (pixels[i + 3] < 100) continue;
        specks.push({
          x: left + x, y: top + y, size: step,
          colour: `rgb(${pixels[i]},${pixels[i + 1]},${pixels[i + 2]})`,
          delay: (x / width) * 0.45 + Math.random() * 0.35,
          near: 0.55 + Math.random() * 0.4,
          turn: Math.random() * Math.PI * 2,
        });
      }
    }
    return specks;
  }

  function drawDust(specks, size, seconds) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(size.W * ratio), h = Math.round(size.H * ratio);
    if (dust.width !== w || dust.height !== h) { dust.width = w; dust.height = h; }
    const draw = dust.getContext("2d");
    draw.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw.clearRect(0, 0, size.W, size.H);
    for (const speck of specks) {
      const u = clamp((seconds - speck.delay) / DUST_FOR);
      if (u >= 1) continue;
      // Towards the viewer: specks spread from the middle and grow as they come closer.
      const closer = 1 / (1 - u * u * speck.near);
      const x = size.cx + (speck.x - size.cx) * closer + Math.cos(speck.turn) * 46 * u;
      const y = size.cy + (speck.y - size.cy) * closer + Math.sin(speck.turn) * 36 * u;
      const dot = Math.min(13, speck.size * (u > 0 ? closer * 0.85 : 1));
      draw.globalAlpha = 1 - Math.pow(u, 1.7);
      draw.fillStyle = speck.colour;
      if (dot > 4) { draw.beginPath(); draw.arc(x, y, dot / 2, 0, Math.PI * 2); draw.fill(); }
      else draw.fillRect(x, y, dot, dot);
    }
    draw.globalAlpha = 1;
  }

  let faded = false;
  const loudness = (level) => {
    const sound = window.__dmSound?.sound;
    if (sound?.isOn()) sound.level?.(level);
  };

  /* The finale runs on its own clock once the name is on screen, then opens the website. */
  let started = 0, entered = false, typed = null, spans = [], specks = null;
  const ending = (on) => {
    document.documentElement.classList.toggle("dmfx-ending", on);
    if (window.__dmSound) window.__dmSound.button.style.visibility = on ? "hidden" : "";
  };
  function finale(frame, size, now) {
    const t = frame.T;
    // The last two scenes of the original ending are replaced.
    if (frame.portals) frame.portals.on = false;
    if (frame.texts.cta) frame.texts.cta.op = 0;
    if (!started && t >= 28.6) started = now;
    if (started && t < 28.0 && !entered) { started = 0; specks = null; ending(false); }
    if (!typed) {
      const logo = document.querySelector(".dm-logo");
      if (logo) {
        typed = document.createElement("div");
        typed.className = "dmfx-type";
        spans = spell(TAGLINE, typed);
        logo.append(typed);
      }
    }
    if (!started) {
      // Scrolled back out of the finale: the music is as loud as before.
      if (faded) { faded = false; loudness(1); }
      spans.forEach((span) => { span.className = ""; });
      show(dark, false); show(dust, false);
      return;
    }
    const s = (now - started) / 1000;
    const quiet = between(s, QUIET_FROM, ENTER_AT - 0.3);
    if (quiet > 0) { faded = true; loudness(Math.pow(1 - quiet, 1.6)); }
    const count = s < TYPE_FROM ? 0 : reduced ? spans.length : Math.min(spans.length, Math.floor((s - TYPE_FROM) / PER_LETTER) + 1);
    const typing = count < spans.length;
    spans.forEach((span, i) => {
      const caret = i === count - 1 && (typing || Math.floor(s * 2.5) % 2 === 0);
      span.className = `${i < count ? "on" : ""}${caret ? " caret" : ""}`;
    });

    const logo = frame.texts.logo;
    if (logo) { logo.op = 1; logo.blur = 0; logo.sc = 1; logo.flare = 1; }
    const gone = s - DUST_FROM;
    if (gone >= 0) {
      if (!specks) {
        spans.forEach((span) => { span.className = "on"; });
        const name = document.querySelector(".dm-logo-base");
        specks = reduced || !name || !typed ? [] : crumble([
          { element: name, colours: ["#ffffff", "#ffffff"] },
          { element: typed, colours: ["#fff3e4", "#ffd9ae"] },
        ], size);
        ending(true);
      }
      if (logo && (specks.length || reduced)) logo.op = reduced ? 1 - between(gone, 0, 0.8) : 0;
      show(dust, specks.length > 0);
      if (specks.length) drawDust(specks, size, gone);
    } else show(dust, false);
    const black = between(gone, 0.7, 2.2);
    show(dark, black > 0);
    dark.style.opacity = String(black);
    if (s >= ENTER_AT && !entered) {
      entered = true;
      window.__dmEnter?.(true);
    }
  }

  /* A close-up journey: every capsule has its own frame and the view travels along the cable to the next one.
     Places are frames [across, down]; the way goes down, far down, right, up, far down and up to the finish, so no
     cable crosses a capsule. */
  const PLACES = [[0, 0], [0.34, 1], [-0.1, 2.05], [0.05, 3.75], [1.2, 3.75], [1.36, 2.45], [2.3, 4.55], [3.3, 3.3]];
  // The sides each cable leaves from and arrives at: top, bottom, left, right.
  const SIDES = ["BT", "BT", "BT", "RL", "TB", "RT", "RL"];
  const NORMAL = { T: [0, -1], B: [0, 1], L: [-1, 0], R: [1, 0] };
  const smooth = (n) => n * n * (3 - 2 * n);
  const along = ([a, b, c, d], n) => {
    const m = 1 - n;
    return [0, 1].map((i) => m * m * m * a[i] + 3 * m * m * n * b[i] + 3 * m * n * n * c[i] + n * n * n * d[i]);
  };
  function bookingChain(frame, size) {
    const nodes = frame.nodes;
    if (!nodes?.on || nodes.pills.length !== 3) return;
    const t = frame.T, step = CHAIN[2] / 5, seconds = performance.now() / 1000;
    const first = nodes.pills[0];
    const zoom = Math.min(1.65, (size.W * 0.82) / first.w); // close up, but never wider than the screen
    const halfWide = (first.w * zoom) / 2, halfHigh = (first.h * zoom) / 2;
    // One frame: far enough apart that the next capsule comes into view only on the way there.
    const across = Math.max(halfWide * 2.7, size.W * 0.62), down = Math.max(halfHigh * 7, size.H * 0.66);
    const places = PLACES.map(([x, y]) => [x * across, y * down]);
    const port = (k, side) => [places[k][0] + NORMAL[side][0] * halfWide, places[k][1] + NORMAL[side][1] * halfHigh];
    const routes = SIDES.map(([leave, arrive], k) => {
      const begin = port(k, leave), end = port(k + 1, arrive);
      const apart = [Math.abs(end[0] - begin[0]), Math.abs(end[1] - begin[1])];
      // Each handle reaches along its own side, as far as the way in that direction.
      const handle = (side) => Math.max(40, apart[NORMAL[side][0] ? 0 : 1] * 0.62);
      return [begin, [begin[0] + NORMAL[leave][0] * handle(leave), begin[1] + NORMAL[leave][1] * handle(leave)],
        [end[0] + NORMAL[arrive][0] * handle(arrive), end[1] + NORMAL[arrive][1] * handle(arrive)], end];
    });
    // How far each cable is drawn: the first two keep the original moments, the others follow the new scroll.
    const drawn = [between(t, 15.15, 16.12), between(t, 16.55, 17.52),
      ...[0, 1, 2, 3, 4].map((k) => between(chain, k * step, (k + 0.82) * step))];

    // The view rides on the tip of the cable being drawn, and settles on the capsule where it ends.
    let view = places[0];
    drawn.forEach((n, k) => {
      if (n <= 0) return;
      const glide = along([places[k], routes[k][1], routes[k][2], places[k + 1]], smooth(n));
      const tip = along(routes[k], n);
      const held = Math.pow(Math.sin(Math.PI * n), 0.6); // how closely the view holds the cable
      view = [0, 1].map((i) => glide[i] + (tip[i] - glide[i]) * held);
    });
    const slide = frame.bg?.whiteX ?? 0; // the capsules leave with the white page
    const screen = ([x, y]) => [size.cx + x - view[0] + slide, size.cy + y - view[1]];
    const star = (x, y) => ({ x: x - halfWide + 0.085 * size.u * zoom, y, size: 0.075 * size.u * zoom });

    nodes.pills.forEach((pill, k) => {
      [pill.x, pill.y] = screen(places[k]);
      pill.sc *= zoom;
      pill.rx = 0;
      Object.assign(nodes.stars[k], star(pill.x, pill.y));
    });
    for (let k = 3; k < places.length; k++) {
      const shown = between(drawn[k - 1], 0.55, 0.92);
      const [x, y] = screen(places[k]);
      nodes.pills.push({
        x, y, w: first.w, h: first.h, op: shown, blur: 10 * (1 - shown), sc: (0.6 + 0.4 * out(shown)) * zoom,
        rx: 0, ry: Math.sin(seconds * 0.7 + k) * 6,
      });
      nodes.stars.push({ on: shown > 0.01, ...star(x, y), rotY: seconds * 1.6 + k, rotZ: 0, op: shown, flash: 0 });
    }

    const [, , leaving] = nodes.lines;
    const cables = routes.map((route, k) => ({ p: drawn[k], wave: 0, pts: route.map(screen) }));
    // "Dealing Completed" stays in the centre; its cable runs straight to the right.
    const side = screen(port(7, "R")), edge = Math.max(side[0] + 24, size.W - 28 + slide);
    const third = (edge - side[0]) / 3;
    leaving.pts = [side, [side[0] + third, side[1]], [side[0] + 2 * third, side[1]], [edge, side[1]]];
    nodes.lines = [...cables, leaving];
  }

  // Cables pass behind the capsules: nothing of them is drawn on top of one.
  window.__dmClip = (draw, nodes) => {
    if (!draw.roundRect) return;
    draw.beginPath();
    draw.rect(-10000, -10000, 30000, 30000);
    for (const pill of nodes.pills) {
      if (pill.op < 0.6) continue;
      const wide = pill.w * pill.sc - 8, high = pill.h * pill.sc - 8;
      draw.roundRect(pill.x - wide / 2, pill.y - high / 2, wide, high, high / 2);
    }
    draw.clip("evenodd");
  };

  /* The ring waves like a sound equalizer: with the music when it plays, on its own while the sound is off. */
  const levels = new Array(48).fill(0);
  let listener = null, heard = null, beat = 0;
  function listen(seconds) {
    if (!listener) {
      const tap = window.__dmSound?.sound.tap?.();
      if (tap) {
        listener = tap.context.createAnalyser();
        listener.fftSize = 256;
        listener.smoothingTimeConstant = 0.7;
        tap.node.connect(listener);
        heard = new Uint8Array(listener.frequencyBinCount);
      }
    }
    let loud = 0;
    if (listener) {
      listener.getByteFrequencyData(heard);
      for (let i = 1; i <= levels.length; i++) loud = Math.max(loud, heard[i]);
    }
    beat = seconds;
    for (let i = 0; i < levels.length; i++) {
      const own = 0.5 + 0.5 * Math.sin(i * 0.9 + seconds * 5.1) * Math.sin(i * 0.37 - seconds * 2.3);
      const music = loud > 24 ? heard[i + 1] / loud : own;
      const target = reduced ? 0 : 0.7 * music + 0.3 * own;
      levels[i] += (target - levels[i]) * 0.3;
    }
  }
  /* The level at an angle of the ring; mirrored, so the wave closes on itself. */
  const levelAt = (angle) => {
    const turn = (((angle / (Math.PI * 2)) * 4) % 2 + 2) % 2;
    const place = (turn > 1 ? 2 - turn : turn) * (levels.length - 1);
    const low = Math.floor(place), mix = place - low;
    return levels[low] + (levels[Math.min(low + 1, levels.length - 1)] - levels[low]) * mix;
  };
  window.__dmWave = (angle) => (reduced ? 1 : 1 + 0.055 * (levelAt(angle) - 0.4) * Math.sin(angle * 22 + beat * 3) + 0.012 * Math.sin(angle * 9 - beat * 4));
  window.__dmRing = (draw, ring, unit, glow) => {
    if (reduced) return;
    const bars = 96, bend = 1 + 2 * ring.m, cos = Math.cos(ring.rot), sin = Math.sin(ring.rot);
    draw.globalCompositeOperation = "source-over";
    draw.globalAlpha = ring.op * (glow ? 0.55 : 0.85);
    draw.strokeStyle = glow ? "rgb(255,120,20)" : "rgb(255,176,92)";
    draw.lineCap = "round";
    draw.lineWidth = Math.max(1.5, unit * (glow ? 0.012 : 0.006));
    draw.beginPath();
    for (let i = 0; i < bars; i++) {
      const angle = (i / bars) * Math.PI * 2, c = Math.cos(angle), n = Math.sin(angle);
      const x = Math.sign(c) * Math.pow(Math.abs(c), bend), y = Math.sign(n) * Math.pow(Math.abs(n), bend);
      const dx = (x * cos - y * sin) * ring.r, dy = (x * sin + y * cos) * ring.r;
      const from = 1.035, to = from + 0.012 + 0.13 * Math.pow(levelAt(angle), 1.6);
      draw.moveTo(ring.x + dx * from, ring.y + dy * from);
      draw.lineTo(ring.x + dx * to, ring.y + dy * to);
    }
    draw.stroke();
  };

  /* The sentences in the ring. Between two of them the words fall into dust and gather again as the next. */
  const SAYINGS = [
    "Many people are still\ncaught up replying to\nclient messages manually,\neven though technology\nhas come so far.",
    "Too busy replying to chats\nto play with your kids\nand make time\nfor your partner",
    "Save your energy for things\nthat truly matter to your\nfamily\u2014don't waste your\ntime just replying\nto messages.",
    "This is the new era\nto handle your job",
  ];
  // Scroll positions of the three changes; the last one starts as the ring changes shape.
  const CHANGES = [[7.1, 9.1], [12.1, 14.1], [MORPH[0] + extra(SENTENCES), MORPH[0] + extra(SENTENCES) + 1.4]];
  const wordDust = add("canvas", "dmfx-words");
  let ring = null, cloud = null;

  /* The dots a sentence is made of, measured from the middle of the screen. */
  function dotsOf(text, look, size) {
    const sheet = document.createElement("canvas");
    sheet.width = size.W; sheet.height = size.H;
    const draw = sheet.getContext("2d", { willReadFrequently: true });
    const lines = text.split("\n"), font = parseFloat(look.fontSize), height = font * 1.3;
    draw.font = `${look.fontSize} Anton, Impact, sans-serif`;
    if ("letterSpacing" in draw && look.letterSpacing !== "normal") draw.letterSpacing = look.letterSpacing;
    draw.textAlign = "center"; draw.fillStyle = "#fff";
    const metrics = draw.measureText("H");
    const ascent = metrics.fontBoundingBoxAscent, descent = metrics.fontBoundingBoxDescent;
    const top = size.cy - (lines.length * height) / 2;
    lines.forEach((line, i) => draw.fillText(line, size.cx, top + i * height + (height - ascent - descent) / 2 + ascent));
    const pixels = draw.getImageData(0, 0, size.W, size.H).data;
    const step = Math.max(2, Math.round(font / 13));
    const dots = [];
    for (let y = 0; y < size.H; y += step) {
      for (let x = 0; x < size.W; x += step) {
        if (pixels[(y * size.W + x) * 4 + 3] > 110) dots.push([x - size.cx, y - size.cy]);
      }
    }
    // Mixed up, so the dust of one sentence crosses over on its way to the next.
    for (let i = dots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [dots[i], dots[j]] = [dots[j], dots[i]]; }
    return { dots, step };
  }

  function ringWords(frame, size) {
    ring ??= document.querySelector(".dm-t-ring");
    const words = frame.texts.ring;
    show(wordDust, false);
    if (!ring || !words || words.op <= 0) return;
    const index = CHANGES.filter(([, to]) => told >= to).length;
    const change = CHANGES.findIndex(([from, to]) => told > from && told < to);
    const saying = SAYINGS[change >= 0 ? change : index];
    if (ring.textContent !== saying) ring.textContent = saying;
    if (change < 0) return;
    const q = (told - CHANGES[change][0]) / (CHANGES[change][1] - CHANGES[change][0]);
    const alpha = words.op;
    if (reduced) {
      words.op = alpha * Math.abs(1 - 2 * q);
      if (q > 0.5) ring.textContent = SAYINGS[change + 1];
      return;
    }
    const key = `${change} ${size.W}x${size.H}`;
    if (cloud?.key !== key) {
      const look = window.getComputedStyle(ring);
      const from = dotsOf(SAYINGS[change], look, size), to = dotsOf(SAYINGS[change + 1], look, size);
      if (!from.dots.length || !to.dots.length) return;
      const specks = Array.from({ length: Math.max(from.dots.length, to.dots.length) }, (_, i) => {
        const angle = Math.random() * Math.PI * 2, away = Math.sqrt(Math.random()) * size.u * 0.62;
        return {
          a: from.dots[i % from.dots.length], b: to.dots[i % to.dots.length], delay: Math.random() * 0.25,
          c: [Math.cos(angle) * away * 1.25, Math.sin(angle) * away - size.u * 0.04],
          warm: `rgb(255,${150 + Math.floor(Math.random() * 90)},${60 + Math.floor(Math.random() * 120)})`,
        };
      });
      cloud = { key, specks, step: from.step };
    }
    words.op = 0;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(size.W * ratio), h = Math.round(size.H * ratio);
    if (wordDust.width !== w || wordDust.height !== h) { wordDust.width = w; wordDust.height = h; }
    const draw = wordDust.getContext("2d");
    draw.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw.clearRect(0, 0, size.W, size.H);
    show(wordDust, true);
    const shift = frame.par?.text ?? { x: 0, y: 0 };
    const scale = words.sc ?? 1;
    const ease = (n) => n * n * (3 - 2 * n);
    draw.globalAlpha = alpha;
    for (const speck of cloud.specks) {
      const p = clamp((q - speck.delay) / 0.75);
      const [start, end, part] = p < 0.5 ? [speck.a, speck.c, ease(p * 2)] : [speck.c, speck.b, ease(p * 2 - 1)];
      const x = size.cx + shift.x + (start[0] + (end[0] - start[0]) * part) * scale;
      const y = size.cy + shift.y + (start[1] + (end[1] - start[1]) * part) * scale;
      const flying = Math.sin(Math.PI * p);
      draw.fillStyle = flying > 0.35 ? speck.warm : "#fff";
      const dot = cloud.step * (1 - 0.35 * flying);
      draw.fillRect(x, y, dot, dot);
    }
    draw.globalAlpha = 1;
  }

  /* The words under the five dots change as the light moves from dot to dot. */
  const WORDS = [
    [-Infinity, "Focus on your skill"],
    [0, "Trust to Ai for reply your client"], // the light leaves the first dot
    [1, "Our Ai Agent can handle your client"], // it moves on to the third dot
    [3, "Want to see the flow?"], // it goes from the fourth dot to the fifth
  ];
  let words = null;
  function lightWords(frame, size) {
    const text = frame.texts.focus;
    if (!text || text.op <= 0) return;
    words ??= document.querySelector(".dm-t-focus");
    if (!words) return;
    const step = ((frame.T - LIGHT[0]) / (LIGHT[1] - LIGHT[0])) * 4; // 0 to 4 across the five dots
    const line = WORDS.filter(([from]) => step > from).pop()[1];
    if (words.textContent !== line) words.textContent = line;
    // Around every change the words blur away and the next ones come into focus.
    const near = Math.min(...WORDS.slice(1).map(([from]) => Math.abs(step - from)));
    const clear = clamp(near / 0.36);
    text.op *= 0.15 + 0.85 * clear;
    text.blur += 18 * (1 - clear);
    text.y += 0.055 * size.u; // clear of the light that swings below the dots
  }

  const nameScene = add("div", "dmfx-name");
  const bar = document.createElement("i"), name = document.createElement("b"), light = document.createElement("u");
  name.textContent = "DEALMAKER";
  nameScene.append(bar, name, light);
  const smoothly = (n) => n * n * (3 - 2 * n);
  function starName(frame, size) {
    const t = frame.T;
    if (frame.word) frame.word.on = false; // the golden name of the original gives way
    const on = t > 5.0 && t < 6.55;
    show(nameScene, on);
    if (!on) return;
    const u = size.u, words = frame.texts.solve;
    const flat = smoothly(between(t, 5.05, 5.45)); // star to rectangle
    const sweep = between(t, 5.55, 5.98); // the light runs left to right
    const leave = smoothly(between(t, 6.2, 6.52));
    if (frame.sparkle && flat > 0) { frame.sparkle.op *= 1 - flat; frame.sparkle.on = frame.sparkle.op > 0.001; }
    const place = size.cy + 0.07 * u - 0.17 * u; // right above "Solve The Problem"
    const x = (words?.x ?? size.cx) + (frame.par?.text.x ?? 0);
    const y = place + (size.cy - place) * leave + (frame.par?.text.y ?? 0);
    const wide = Math.min(0.78 * u, size.W - 32), scale = 1 - 0.7 * leave;
    name.style.fontSize = "100px";
    name.style.fontSize = `${(100 * wide) / (name.offsetWidth || wide)}px`;
    const from = frame.sparkle?.y ?? y;
    const width = 0.05 * u + (wide - 0.05 * u) * flat, height = 0.05 * u + (0.03 * u - 0.05 * u) * flat;
    bar.style.width = `${width}px`;
    bar.style.height = `${height}px`;
    bar.style.left = `${x}px`;
    bar.style.top = `${from + (y - from) * flat}px`;
    bar.style.opacity = String(flat * (1 - leave));
    // The light eats the bar from the left and leaves the name behind.
    bar.style.clipPath = `inset(-60px -60px -60px ${sweep > 0 ? `${sweep * 100}%` : "-60px"})`;
    name.style.left = `${x}px`;
    name.style.top = `${y}px`;
    name.style.transform = `translate(-50%,-50%) scale(${scale})`;
    name.style.clipPath = `inset(-20% ${(1 - sweep) * 100}% -20% -5%)`;
    name.style.opacity = String(sweep > 0 ? 1 - leave : 0);
    const flash = Math.sin(Math.PI * between(t, 5.5, 6.05));
    light.style.left = `${x - wide / 2 + wide * sweep}px`;
    light.style.top = `${y}px`;
    light.style.width = `${0.3 * u}px`;
    light.style.height = `${0.42 * u}px`;
    light.style.opacity = String(reduced ? 0 : flash);
  }

  let photo = null;
  function backdrop(frame) {
    if (!photo) {
      const white = document.querySelector(".dm-bg-white");
      if (!white) return;
      photo = document.createElement("div");
      photo.className = "dmfx-photo";
      white.before(photo);
    }
    const shown = 1 - between(frame.T, 13.7, 14.0);
    photo.style.opacity = String(shown);
    show(photo, shown > 0);
  }

  /* Called by the intro for every frame, before it draws. */
  window.__dmFx = (frame, size) => {
    // The soft light and the sliding title of this scene make way for the flying letters.
    if (frame.meta) frame.meta.on = false;
    if (frame.texts.payment) frame.texts.payment.op = 0;
    backdrop(frame);
    listen(performance.now() / 1000);
    ringWords(frame, size);
    starName(frame, size);
    lightWords(frame, size);
    bookingChain(frame, size);
    drawTitle(frame, size);
    finale(frame, size, performance.now());
  };
})();
