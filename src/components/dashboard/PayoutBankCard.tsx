import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StudioSoon } from "./StudioPage";
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
    toast.success(t("Bank details saved. Withdrawals open in 48 hours."));
    qc.invalidateQueries({ queryKey: ["bank-details", artistId] });
  };

  return (
    <section className="studio-account-section space-y-3">
      <h2 className="flex items-center gap-2 text-xl font-semibold">{d && <Lock className="h-4 w-4" />}{t("Payout bank account")}</h2>
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
      <h2 className="border-t pt-6">{t("UAE transfer")} <span className="it">{t("details")}</span></h2>
      <Label htmlFor="bank-iban">IBAN</Label>
      <Input id="bank-iban" dir="ltr" disabled={!!d} maxLength={34} value={d ? maskIban(d.iban) : f.iban} onChange={(e) => setF({ ...f, iban: e.target.value })} placeholder="AE00 0000 0000 0000 0000 000" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="bank-swift">SWIFT / BIC</Label>
          <Input id="bank-swift" dir="ltr" disabled={!!d} maxLength={11} value={d ? (d.swift ?? "") : f.swift} onChange={(e) => setF({ ...f, swift: e.target.value })} />
        </div>
        <StudioSoon label="Emirates ID" />
        <div><Label>{t("Country")}</Label><Input disabled value="United Arab Emirates" /></div>
        <div><Label>{t("Currency")}</Label><Input disabled value="AED" /></div>
      </div>
      {!d && <Button className="bg-gradient-gold text-gold-foreground" disabled={busy} onClick={save}>{busy ? t("Saving…") : t("Save bank details")}</Button>}
    </section>
  );
}
