import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignupRatecards } from "./SignupRatecards";
import { ratePayload, restoreRateDraft, type RateDraft } from "@/lib/ratecard";

/** Last registration step, opened once the deposit is paid: starting price and rate cards. */
export function JoinRateStep({ artistId, userId, onDone }: { artistId: string; userId: string; onDone: () => void }) {
  const key = `join_rate_draft:${userId}`;
  const [basePrice, setBasePrice] = useState("");
  const [pkgs, setPkgs] = useState<RateDraft[]>([]);
  const [pending, setPending] = useState(false);
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) { const draft = JSON.parse(raw); setBasePrice(draft.basePrice ?? ""); setPkgs(Array.isArray(draft.pkgs) ? draft.pkgs.map(restoreRateDraft) : []); }
    } catch { localStorage.removeItem(key); }
    setRestored(true);
  }, [key]);
  useEffect(() => { if (restored) localStorage.setItem(key, JSON.stringify({ basePrice, pkgs })); }, [restored, key, basePrice, pkgs]);

  const problem = (): string | null => {
    if (pending) return "Save or clear the current ratecard before continuing.";
    if (!Number.isFinite(Number(basePrice)) || Number(basePrice) <= 0 || !pkgs.length) return "Enter a starting price and save at least one ratecard.";
    try { pkgs.forEach(ratePayload); } catch { return "Complete each ratecard's title, base items, quantity and price."; }
    return null;
  };
  const submit = async () => {
    const error = problem();
    if (error) { toast.error(error); return; }
    setBusy(true);
    try {
      // Price first, then every rate card in one insert, so a failure leaves this step open to retry.
      const price = await supabase.from("artists").update({ base_price: Number(basePrice) }).eq("id", artistId);
      if (price.error) throw price.error;
      const saved = await supabase.from("rate_cards").insert(pkgs.map((draft, index) => ({ ...ratePayload(draft), artist_id: artistId, sort: index + 1 })));
      if (saved.error) throw saved.error;
      localStorage.removeItem(key);
      localStorage.removeItem(`join_rate_editor:${userId}`);
      toast.success("Rate card saved. Welcome to your dashboard.");
      onDone();
    } catch (failure) { toast.error(`${(failure as Error).message} — your rate card draft is kept.`); }
    finally { setBusy(false); }
  };
  const blocked = problem();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Step 6 · Rate card</h2>
      <p className="text-center text-sm text-muted-foreground">Your deposit is paid. Add your prices to finish registration.</p>
      <div><Label htmlFor="join-base-price">Starting price (AED)</Label><Input id="join-base-price" type="number" min={0} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} /></div>
      {/* Mounted after the saved packages are back, so a half-edited package reopens on the right row. */}
      {restored && <SignupRatecards packages={pkgs} onChange={setPkgs} draftKey={`join_rate_editor:${userId}`} onPending={setPending} />}
      <div className="flex justify-end pt-4"><Button type="button" disabled={busy || blocked !== null} onClick={() => void submit()} className="bg-gradient-gold text-gold-foreground">{busy ? "Saving…" : "Save & go to dashboard"}</Button></div>
    </div>
  );
}
