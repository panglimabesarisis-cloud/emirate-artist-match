type Scene = { element: HTMLDivElement; paint: (elapsed: number, reduced: boolean) => void };
const scenes = new Set<Scene>();
let frame = 0;
let epoch = 0;
let media: MediaQueryList | undefined;
const tick = (now: number) => {
  const reduced = media?.matches ?? false;
  for (const scene of scenes) if (!document.hidden) scene.paint(now - epoch, reduced);
  frame = reduced || scenes.size === 0 ? 0 : requestAnimationFrame(tick);
};
const restart = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(tick); };
// Every mounted scene subscribes to the same continuous browser clock.
export function subscribeScene(scene: Scene) {
  if (scenes.size === 0) {
    if (!epoch) epoch = performance.now();
    media = matchMedia("(prefers-reduced-motion: reduce)");
    media.addEventListener("change", restart);
    document.addEventListener("visibilitychange", restart);
  }
  scenes.add(scene);
  scene.paint(performance.now() - epoch, media?.matches ?? false);
  if (!frame && !media?.matches) restart();
  return () => {
    scenes.delete(scene);
    if (scenes.size === 0) {
      cancelAnimationFrame(frame); frame = 0;
      media?.removeEventListener("change", restart);
      document.removeEventListener("visibilitychange", restart);
    }
  };
}
