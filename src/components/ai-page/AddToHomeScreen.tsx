import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type InstallPrompt = Event & { prompt: () => Promise<void> };
const SEEN = "dm-pwa-seen";

const IOS_STEPS = ["Tap the Share button at the bottom of Safari (on iPad, at the top right).", "Scroll down and tap Add to Home Screen.", "Tap Add in the top right corner."];
const OTHER_STEPS = ["Tap the menu button (⋮) in your browser.", "Tap Install app or Add to Home screen.", "Tap Add or Install to confirm."];

/** Offered once on phones and tablets that are not already running the page as an app. */
export function AddToHomeScreen() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);
  const install = useRef<InstallPrompt | null>(null);
  useEffect(() => {
    const keep = (e: Event) => { e.preventDefault(); install.current = e as InstallPrompt; };
    window.addEventListener("beforeinstallprompt", keep);
    const agent = navigator.userAgent;
    const apple = /iphone|ipad|ipod/i.test(agent) || (/macintosh/i.test(agent) && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let seen = false;
    try { seen = localStorage.getItem(SEEN) === "1"; } catch { /* private window */ }
    setIos(apple);
    const timer = (apple || /android/i.test(agent)) && !standalone && !seen ? window.setTimeout(() => setOpen(true), 1800) : undefined;
    return () => { window.removeEventListener("beforeinstallprompt", keep); window.clearTimeout(timer); };
  }, []);
  const done = () => { try { localStorage.setItem(SEEN, "1"); } catch { /* private window */ } setOpen(false); };
  const accept = () => { const prompt = install.current; install.current = null; if (prompt) void prompt.prompt().finally(done); else done(); };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) done(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md text-center">
        <span aria-hidden className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-gold font-display text-4xl text-gold-foreground">D</span>
        <DialogTitle className="text-center font-display text-3xl font-normal">{t("Add to")} <span className="it">{t("Home Screen")}</span></DialogTitle>
        <DialogDescription className="text-center">{t("Open Dealmaker like an app: full screen and one tap away.")}</DialogDescription>
        <ol className="list-decimal space-y-2 ps-5 text-start text-sm">{(ios ? IOS_STEPS : OTHER_STEPS).map((step) => <li key={step}>{t(step)}</li>)}</ol>
        <div className="flex justify-center gap-2"><Button variant="outline" onClick={done}>{t("Later")}</Button><Button className="bg-gradient-gold font-bold text-gold-foreground" onClick={accept}>{t("Got it")}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
