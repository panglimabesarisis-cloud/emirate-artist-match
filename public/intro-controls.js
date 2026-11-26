/* Controls added around the intro: auto play with its music, skip, and the way into the website. */
(() => {
  const intro = window.__dmSound;
  const framed = window.parent !== window;
  const enter = (fade) => {
    if (framed) window.parent.postMessage({ type: "dm-intro-done", fade: fade === true }, window.location.origin);
    else window.location.href = "/";
  };
  window.__dmEnter = enter;

  const style = document.createElement("style");
  style.textContent = `
    .dmx{position:fixed;z-index:6;bottom:max(24px,env(safe-area-inset-bottom));height:42px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,220,190,.28);background:rgba(20,12,8,.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#ffecdc;font:400 12px Anton,Impact,sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;transition:border-color .3s ease,background .3s ease}
    .dmx:hover,.dmx:focus-visible{border-color:#ff8a1f;outline:none}
    .dmx-play{right:max(24px,env(safe-area-inset-right))}
    .dmx-play[aria-pressed="true"]{background:#ff6a00;border-color:#ff6a00;color:#fff}
    .dmx-skip{left:max(24px,env(safe-area-inset-left))}
    .dmx-credit{position:fixed;z-index:6;left:50%;bottom:max(5px,env(safe-area-inset-bottom));transform:translateX(-50%);width:max-content;max-width:calc(100vw - 20px);margin:0;text-align:center;font:400 10px/1.35 system-ui,sans-serif;color:rgba(255,236,220,.75);text-shadow:0 0 4px #000,0 0 8px #000}
    .dmx-credit a{color:inherit}
    .dmfx-ending .dmx-credit{opacity:0;pointer-events:none}
    @media (max-width:520px){.dmx{height:38px;padding:0 14px;font-size:11px;bottom:max(76px,env(safe-area-inset-bottom))}.dmx-play{right:14px}.dmx-skip{left:14px}}
  `;
  document.head.append(style);

  const button = (name, label) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `dmx dmx-${name}`;
    el.textContent = label;
    document.body.append(el);
    return el;
  };

  // The music starts with Auto play. The speaker button still switches it by hand, and a visitor who switched it
  // off is left in peace.
  let muted = false;
  const mark = (on) => {
    intro.button.dataset.state = on ? "on" : "off";
    intro.button.setAttribute("aria-pressed", String(on));
  };
  if (intro) {
    mark(false);
    intro.button.addEventListener("click", () => { muted = !intro.sound.isOn(); });
  }
  const music = () => {
    if (!intro || muted || intro.sound.isOn()) return;
    intro.sound.set(true);
    mark(true);
  };

  // Auto play scrolls down slowly; touching, scrolling or pressing a key stops it.
  const play = button("play", "▶ Auto play");
  const SECONDS = 92; // for the whole intro
  let frame = 0;
  const end = () => document.documentElement.scrollHeight - window.innerHeight;
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    play.textContent = "▶ Auto play";
    play.setAttribute("aria-pressed", "false");
  };
  const start = () => {
    if (window.scrollY >= end() - 2) window.scrollTo(0, 0);
    let position = window.scrollY;
    let last = performance.now();
    play.textContent = "❚❚ Pause";
    play.setAttribute("aria-pressed", "true");
    const step = (now) => {
      const passed = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      position = Math.min(end(), position + (end() / SECONDS) * passed);
      window.scrollTo(0, position);
      if (position >= end()) stop();
      else frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  play.setAttribute("aria-pressed", "false");
  play.addEventListener("click", () => {
    if (frame) { stop(); return; }
    music();
    start();
  });
  ["wheel", "touchstart", "keydown", "mousedown"].forEach((name) =>
    window.addEventListener(name, (event) => { if (frame && !play.contains(event.target)) stop(); }, { passive: true }),
  );

  // The licence of the music (CC BY 3.0) asks for this credit.
  const credit = document.createElement("p");
  credit.className = "dmx-credit";
  credit.innerHTML = 'Music: <a href="https://soundcloud.com/user-734462061">WombatNoisesAudio</a>, "The Legend of Narmer" (excerpt), <a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>, via <a href="https://breakingcopyright.com">BreakingCopyright</a>';
  credit.querySelectorAll("a").forEach((link) => { link.target = "_blank"; link.rel = "noopener noreferrer"; });
  document.body.append(credit);

  button("skip", "Skip intro").addEventListener("click", () => enter());
  window.addEventListener("keydown", (event) => { if (event.key === "Escape") enter(); });
})();
