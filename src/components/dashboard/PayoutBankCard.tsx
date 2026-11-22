import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BANK_HOLD_HOURS, maskIban, useBankDetails } from "./useBankDetails";

const IBAN_AE = /^AE\d{21}$/;

/**
 * UAE payout account. First time: the artist fills it in. After saving it is locked in the UI
 * (support changes it), and any change pauses withdrawals for 48 hours (enforced in the database).
 */
export function PayoutBankCard({ userId }: { userId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const artist = useQuery({
    queryKey: ["account-artist", userId],
    enabled: !!userId,
    queryFn: async () => (await supabase.from("artists").select("id").eq("user_id", userId).maybeSingle()).data,
  });
  const artistId = artist.data?.id ?? "";
  const bank = useBankDetails(artistId);
  const [f, setF] = useState({ account_type: "personal", holder_name: "", bank_name: "", branch: "", iban: "", swift: "" });
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (!artistId) return null;
  const d = bank.data;

  const save = async () => {
    const iban = f.iban.replace(/\s+/g, "").toUpperCase();
    if (!f.holder_name.trim() || !f.bank_name.trim()) { toast.error(t("Enter the account holder and bank name")); return; }
    if (!IBAN_AE.test(iban)) { toast.error(t("Enter a valid UAE IBAN (AE + 21 digits)")); return; }
    setBusy(true);
    const { error } = await supabase.from("artist_bank_details").insert({
      artist_id: artistId,
      account_type: f.account_type,
      holder_name: f.holder_name.trim(),
      bank_name: f.bank_name.trim(),
      branch: f.branch.trim() || null,
      iban,
      swift: f.swift.trim().toUpperCase() || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setConfirming(false);
    toast.success(t("Bank details saved. Withdrawals open in 48 hours."));
    qc.invalidateQueries({ queryKey: ["bank-details", artistId] });
  };

  return (
    <>
    <section className="studio-account-section space-y-3">
      <div className="account-section-head"><h2>{t("Bank")} <span className="it">{t("details")}</span></h2><span className="account-status"><Lock className="size-3" />{t(d ? "Locked" : "Not set yet")}</span></div>
      <p className="text-sm text-muted-foreground">
        {d ? t("UAE bank transfer. These details are locked; contact support to change them.") : `${t("UAE bank transfer. Add your account once; it locks after saving.")} ${t("Withdrawals open")} ${BANK_HOLD_HOURS} ${t("hours after saving.")}`}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="bank-type">{t("Account type")}</Label>
          <select id="bank-type" disabled={!!d} value={d?.account_type ?? f.account_type} onChange={(e) => setF({ ...f, account_type: e.target.value })} className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60">
            <option value="personal">{t("Personal")}</option>
            <option value="business">{t("Business")}</option>
          </select>
        </div>
        <div>
          <Label htmlFor="bank-name">{t("Bank name")}</Label>
          <Input id="bank-name" disabled={!!d} maxLength={80} value={d ? (d.bank_name ?? "") : f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} placeholder={t("Not set yet")} />
        </div>
        <div>
          <Label htmlFor="bank-holder">{t("Account holder")}</Label>
          <Input id="bank-holder" disabled={!!d} maxLength={80} value={d ? (d.holder_name ?? "") : f.holder_name} onChange={(e) => setF({ ...f, holder_name: e.target.value })} placeholder={t("Not set yet")} />
        </div>
        <div>
          <Label htmlFor="bank-branch">{t("Branch (optional)")}</Label>
          <Input id="bank-branch" disabled={!!d} maxLength={80} value={d ? (d.branch ?? "") : f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })} />
        </div>
      </div>
    </section>
    <section className="studio-account-section space-y-3">
      <div className="account-section-head"><div><h2>{t("UAE transfer")} <span className="it">{t("details")}</span></h2><p>{t("UAE bank transfer. Add your account once; it locks after saving.")}</p></div>{d && <span className="account-status"><Lock className="size-3" />{t("Locked")}</span>}</div>
      <Label htmlFor="bank-iban">IBAN</Label>
      <Input id="bank-iban" dir="ltr" disabled={!!d} maxLength={34} value={d ? maskIban(d.iban) : f.iban} onChange={(e) => setF({ ...f, iban: e.target.value })} placeholder="AE00 0000 0000 0000 0000 000" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="bank-swift">SWIFT / BIC</Label>
          <Input id="bank-swift" dir="ltr" disabled={!!d} maxLength={11} value={d ? (d.swift ?? "") : f.swift} onChange={(e) => setF({ ...f, swift: e.target.value })} />
        </div>

        <div><Label>{t("Country")}</Label><Input disabled value="United Arab Emirates" /></div>
        <div><Label>{t("Currency")}</Label><Input disabled value="AED" /></div>
      </div>
      {!d && <Button className="bg-gradient-gold text-gold-foreground" disabled={busy || bank.isPending} onClick={() => setConfirming(true)}>{busy ? t("Saving…") : t("Save bank details")}</Button>}
      {bank.error && <p role="alert" className="text-destructive">{bank.error.message}</p>}
    </section>
    <Dialog open={confirming} onOpenChange={open => { if (!busy) setConfirming(open); }}><DialogContent className="account-modal"><DialogHeader><span className="studio-empty-icon"><Lock className="size-6" /></span><DialogTitle>{t("Save payout details")}</DialogTitle><DialogDescription>{t("UAE bank transfer. Add your account once; it locks after saving.")} {t("Withdrawals open")} {BANK_HOLD_HOURS} {t("hours after saving.")}</DialogDescription></DialogHeader><dl className="account-record"><div><dt>{t("Account holder")}</dt><dd>{f.holder_name}</dd></div><div><dt>{t("Bank name")}</dt><dd>{f.bank_name}</dd></div><div><dt>IBAN</dt><dd dir="ltr">{maskIban(f.iban.replace(/\s+/g, ""))}</dd></div></dl><DialogFooter className="account-modal-footer"><Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>{t("Cancel")}</Button><Button disabled={busy} onClick={() => void save()}>{t(busy ? "Saving…" : "Save payout details")}</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
}
