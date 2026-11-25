import { useEffect, type RefObject } from "react";

/** One reversible timeline controls letters, orbit and landing; no artist data mutations. */
export function useFeaturedChoreography(ref: RefObject<HTMLDivElement | null>, count: number) {
  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};
    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([{ gsap }, { ScrollTrigger }]) => {
      const root = ref.current;
      if (cancelled || !root || !count) return;
      gsap.registerPlugin(ScrollTrigger);
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const scene = root.querySelector<HTMLElement>(".talent-scene");
        const word = root.querySelector<HTMLElement>(".talent-word");
        const letters = gsap.utils.toArray<HTMLElement>(".talent-letter", root);
        const cards = gsap.utils.toArray<HTMLElement>(".talent-slot", root);
        if (!scene || !word || !cards.length) return;
        const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--site-header-height")) || 74;
        const center = () => ({ x: scene.clientWidth / 2, y: Math.max(260, (window.innerHeight - header) / 2) });
        const offset = (card: HTMLElement) => ({ x: center().x - card.offsetLeft - card.offsetWidth / 2, y: center().y - card.offsetTop - card.offsetHeight / 2 });
        const radius = () => Math.max(75, Math.min(scene.clientWidth * .32, (window.innerHeight - header) * .31, 320));
        const angle = (i: number, turn = 0) => i * Math.PI * 2 / cards.length - Math.PI / 2 + turn;
        root.dataset["animated"] = "true";
        root.dataset["landed"] = "false";
        scene.inert = true;
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          const before = scene.getBoundingClientRect().top;
          timeline.scrollTrigger?.kill(true, true);
          timeline.pause();
          gsap.set(cards, { x: 0, y: 0, scale: 1, rotation: 360, opacity: 1 });
          gsap.set(word, { opacity: 0 });
          root.dataset["landed"] = "true";
          scene.inert = false;
          window.scrollBy(0, scene.getBoundingClientRect().top - before);
        };
        const timeline = gsap.timeline({
          defaults: { ease: "power3.inOut" },
          scrollTrigger: {
            trigger: scene, start: `top top+=${header}`, end: () => `+=${window.innerHeight * 4.6}`,
            pin: true, scrub: .65, anticipatePin: 1, invalidateOnRefresh: true,
            onUpdate: self => {
              if (released) return;
              const landed = self.progress >= .97;
              root.dataset["landed"] = landed ? "true" : "false";
              scene.inert = !landed;
            },
            onLeave: () => { gsap.delayedCall(.8, release); },
          },
        });
        timeline.set(cards, { x: (_, el: HTMLElement) => offset(el).x, y: (_, el: HTMLElement) => offset(el).y, scale: .62, opacity: 0, rotation: 0 }, 0);
        timeline.set(word, { opacity: 1, scale: 1 }, 0);
        timeline.fromTo(letters, { x: i => i < 4 ? -scene.clientWidth : scene.clientWidth, opacity: 0 }, { x: 0, opacity: 1, duration: 10, stagger: .65, ease: "power3.out" }, 10);
        timeline.to(letters, { x: i => (4 - i) * (scene.clientWidth < 640 ? 3 : 10), duration: 5 }, 25);
        timeline.to(word, { scale: () => scene.clientWidth < 640 ? .6 : .36, duration: 7 }, 26);
        timeline.to(cards[0] ?? [], { opacity: 1, duration: 6 }, 27);
        timeline.to(word, { scale: () => scene.clientWidth < 640 ? .85 : .54, duration: 5 }, 33);
        timeline.to(word, { opacity: 0, duration: 5 }, 38);
        timeline.to(cards, { opacity: 1, duration: 3, stagger: .18 }, 42);
        cards.forEach((card, i) => {
          timeline.to(card, { x: () => offset(card).x + radius() * Math.cos(angle(i)), y: () => offset(card).y + radius() * Math.sin(angle(i)), scale: .2, rotation: i * 360 / cards.length, duration: 18 }, 43 + i * .15);
          const orbit = { turn: 0 };
          timeline.fromTo(orbit, { turn: 0 }, {
            turn: Math.PI, duration: 12, ease: "none",
            onUpdate: () => gsap.set(card, {
              x: offset(card).x + radius() * Math.cos(angle(i, orbit.turn)),
              y: offset(card).y + radius() * Math.sin(angle(i, orbit.turn)),
              rotation: i * 360 / cards.length + orbit.turn * 180 / Math.PI,
            }),
          }, 62);
          timeline.to(card, { x: 0, y: 0, scale: 1, rotation: 360, duration: 14 }, 74 + i * .7);
        });
        timeline.to({}, { duration: 4 }, 96);
        // Re-measure after font loading, without changing the artist list or restarting scroll.
        void document.fonts.ready.then(() => { if (!cancelled) ScrollTrigger.refresh(); });
        const observer = new ResizeObserver(() => ScrollTrigger.refresh());
        observer.observe(scene);
        // Demos above this section can change height as they play: re-measure when the section has moved.
        let top = Math.round(root.getBoundingClientRect().top + window.scrollY);
        const moved = new ResizeObserver(() => {
          const now = Math.round(root.getBoundingClientRect().top + window.scrollY);
          if (!released && Math.abs(now - top) > 2) { top = now; ScrollTrigger.refresh(); }
        });
        const main = root.closest("main");
        if (main) moved.observe(main);
        return () => { moved.disconnect(); observer.disconnect(); scene.inert = false; delete root.dataset["animated"]; delete root.dataset["landed"]; };
      });
      dispose = () => media.revert();
    });
    return () => { cancelled = true; dispose(); };
  }, [ref, count]);
}