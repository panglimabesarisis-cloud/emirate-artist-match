import { useEffect, useState } from "react";

const SEEN = "dm-intro-seen";
// Remembered while the app is open, so going back to the home page never shows the cover again.
let closed = false;

/** The animated intro (public/intro.html), over the home page once per visit. */
export function IntroOverlay() {
  const [state, setState] = useState<"waiting" | "open" | "leaving" | "closed">(closed ? "closed" : "waiting");
  // After the finale turns the screen black, the website fades in from black.
  const close = (fade = false) => {
    closed = true;
    try { sessionStorage.setItem(SEEN, "1"); } catch { /* private mode: shown again next time */ }
    setState(fade ? "leaving" : "closed");
    if (fade) window.setTimeout(() => setState("closed"), 900);
  };

  useEffect(() => {
    if (closed) return;
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN) === "1"; } catch { /* storage blocked */ }
    if (seen) close();
    else setState("open");
  }, []);

  useEffect(() => {
    if (state !== "open") return;
    const message = (event: MessageEvent) => {
      const data = event.data as { type?: string; fade?: boolean } | null;
      if (event.origin === window.location.origin && data?.type === "dm-intro-done") close(data.fade === true);
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const page = document.documentElement.style;
    const overflow = page.overflow;
    page.overflow = "hidden";
    window.addEventListener("message", message);
    window.addEventListener("keydown", key);
    return () => {
      page.overflow = overflow;
      window.removeEventListener("message", message);
      window.removeEventListener("keydown", key);
    };
  }, [state]);

  if (state === "closed") return null;
  if (state === "leaving") {
    return <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[2147483000] bg-black animate-out fade-out duration-900 fill-mode-forwards" />;
  }
  return (
    <div id="dm-intro" className="fixed inset-0 z-[2147483000] bg-[#0d0907]">
      <noscript><style>{"#dm-intro{display:none}"}</style></noscript>
      {state === "open" && (
        <iframe
          src="/intro.html"
          title="Dealmaker intro"
          allow="autoplay"
          className="block h-full w-full border-0"
          // An intro that did not load never keeps visitors out.
          onLoad={(event) => {
            const frame = event.currentTarget;
            if (!frame.contentDocument?.getElementById("app")) close();
            else frame.focus();
          }}
        />
      )}
    </div>
  );
}
