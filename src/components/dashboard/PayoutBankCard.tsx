import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveBankDetails } from "@/lib/account-otp.functions";
import { bankProblem, type BankForm } from "@/lib/account-otp-rules";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOtpGate } from "@/components/shared/OtpGate";
import { BANK_HOLD_DAYS, maskIban, useBankDetails, type BankDetails } from "./useBankDetails";

type Section = "bank" | "transfer";
const formOf = (d: BankDetails | null | undefined): BankForm => ({
  account_type: d?.account_type ?? "personal", holder_name: d?.holder_name ?? "", bank_name: d?.bank_name ?? "",
  branch: d?.branch ?? "", iban: d?.iban ?? "", swift: d?.swift ?? "",
});

/**
 * UAE payout account. Each section opens for editing only after a WhatsApp code; the server saves it,
 * tells the artist on WhatsApp, and the database pauses withdrawals for 3 days after a change.
 */
export function PayoutBankCard({ userId }: { userId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const artist = useQuery({
    queryKey: ["account-artist", userId],
    enabled: !!userId,
    queryFn: async () => (await supabase.rpc("private_artists").select("id").eq("user_id", userId).maybeSingle()).data,
  });
  const artistId = artist.data?.id ?? "";
  const bank = useBankDetails(artistId);
  const save$ = useServerFn(saveBankDetails);
  const gate = useOtpGate();
  const [editing, setEditing] = useState<Section[]>([]);
  const [form, setForm] = useState<BankForm>(formOf(null));
  const [busy, setBusy] = useState(false);
  if (!artistId) return null;
  const d = bank.data;
  const open = editing.length > 0;
  const shown = open ? form : formOf(d);
  const set = (patch: Partial<BankForm>) => setForm((f) => ({ ...f, ...patch }));
  // A first account needs both sections before it can be saved.
  const edit = (section: Section) => void gate.run("always", () => {
    if (!open) setForm(formOf(d));
    setEditing((now) => (d ? [...new Set([...now, section])] : ["bank", "transfer"]));
  });
  const cancel = () => setEditing([]);
  const save = async () => {
    const problem = bankProblem(form);
    if (problem) { toast.error(t(problem)); return; }
    // The code may have expired while typing; the gate asks again only then.
    await gate.run("always", () => void send());
  };
  const send = async () => {
    setBusy(true);
    try {
      const r = await save$({ data: form });
      if (!r.ok) { toast.error(t(r.error)); return; }
      setEditing([]);
      if (!r.changed) toast.success(t("Nothing changed."));
      else toast.success(`${t("Bank details saved. Withdrawals open in")} ${BANK_HOLD_DAYS} ${t("days")}.${r.notified ? "" : ` ${t("The WhatsApp notice could not be sent.")}`}`);
      await qc.invalidateQueries({ queryKey: ["bank-details", artistId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Could not save your bank details"));
    } finally { setBusy(false); }
  };
  const status = (section: Section) => !editing.includes(section) && (
    <Button type="button" variant="outline" size="sm" disabled={bank.isPending || busy} onClick={() => edit(section)}><Pencil className="size-4" />{t(d ? "Edit" : "Add bank details")}</Button>
  );
  const actions = (section: Section) => editing.includes(section) && (
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="outline" disabled={busy} onClick={cancel}>{t("Cancel")}</Button>
      <Button type="button" className="bg-gradient-gold text-gold-foreground" disabled={busy} onClick={() => void save()}>{t(busy ? "Saving…" : "Save")}</Button>
    </div>
  );
  const bankOff = !editing.includes("bank"), transferOff = !editing.includes("transfer");
  const note = `${t("Changing these details needs a WhatsApp code. Withdrawals pause for")} ${BANK_HOLD_DAYS} ${t("days after a change.")}`;

  return (
    <>
      <section className="studio-account-section space-y-3">
        <div className="account-section-head"><h2>{t("Bank")} <span className="it">{t("details")}</span></h2>{status("bank") || <span className="account-status"><Pencil className="size-3" />{t("Editing")}</span>}</div>
        <p className="text-sm text-muted-foreground"><Lock className="me-1.5 inline size-3.5 text-gold" aria-hidden="true" />{note}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="bank-type">{t("Account type")}</Label>
            <select id="bank-type" disabled={bankOff} value={shown.account_type} onChange={(e) => set({ account_type: e.target.value })} className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60">
              <option value="personal">{t("Personal")}</option>
              <option value="business">{t("Business")}</option>
            </select>
          </div>
          <div><Label htmlFor="bank-name">{t("Bank name")}</Label><Input id="bank-name" disabled={bankOff} maxLength={80} value={shown.bank_name} onChange={(e) => set({ bank_name: e.target.value })} placeholder={t("Not set yet")} /></div>
          <div><Label htmlFor="bank-holder">{t("Account holder")}</Label><Input id="bank-holder" disabled={bankOff} maxLength={80} value={shown.holder_name} onChange={(e) => set({ holder_name: e.target.value })} placeholder={t("Not set yet")} /></div>
          <div><Label htmlFor="bank-branch">{t("Branch (optional)")}</Label><Input id="bank-branch" disabled={bankOff} maxLength={80} value={shown.branch} onChange={(e) => set({ branch: e.target.value })} /></div>
        </div>
        {actions("bank")}
      </section>
      <section className="studio-account-section space-y-3">
        <div className="account-section-head"><h2>{t("UAE transfer")} <span className="it">{t("details")}</span></h2>{status("transfer") || <span className="account-status"><Pencil className="size-3" />{t("Editing")}</span>}</div>
        <Label htmlFor="bank-iban">IBAN</Label>
        <Input id="bank-iban" dir="ltr" disabled={transferOff} maxLength={34} value={transferOff ? maskIban(shown.iban) : shown.iban} onChange={(e) => set({ iban: e.target.value })} placeholder="AE00 0000 0000 0000 0000 000" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="bank-swift">SWIFT / BIC</Label><Input id="bank-swift" dir="ltr" disabled={transferOff} maxLength={11} value={shown.swift} onChange={(e) => set({ swift: e.target.value })} /></div>
          <div><Label>{t("Country")}</Label><Input disabled value="United Arab Emirates" /></div>
          <div><Label>{t("Currency")}</Label><Input disabled value="AED" /></div>
        </div>
        {actions("transfer")}
        {bank.error && <p role="alert" className="text-destructive">{bank.error.message}</p>}
      </section>
      {gate.dialog}
    </>
  );
}
