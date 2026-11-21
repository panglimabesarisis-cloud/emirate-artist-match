import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StudioSoon } from "./StudioPage";
import { maskIban, useBankDetails } from "./useBankDetails";

/** Read-only UAE payout account. Values are set during verification and can only be changed by support. */
export function PayoutBankCard({ userId }: { userId: string }) {
  const { t } = useI18n();
  const artist = useQuery({
    queryKey: ["account-artist", userId],
    enabled: !!userId,
    queryFn: async () => (await supabase.from("artists").select("id").eq("user_id", userId).maybeSingle()).data,
  });
  const artistId = artist.data?.id ?? "";
  const bank = useBankDetails(artistId);
  if (!artistId) return null;
  const d = bank.data;
  return (
    <section className="studio-account-section space-y-3">
      <h2 className="flex items-center gap-2 text-xl font-semibold"><Lock className="h-4 w-4" />{t("Payout bank account")}</h2>
      <p className="text-sm text-muted-foreground">{t("UAE bank transfer. These details are locked; contact support to change them.")}</p>
      <div className="grid gap-4 sm:grid-cols-2"><StudioSoon label="Account type" /><div><Label htmlFor="bank-name">{t("Bank name")}</Label>
      <Input id="bank-name" disabled value={d?.bank_name ?? ""} placeholder={t("Not set yet")} />
      </div><div><Label htmlFor="bank-holder">{t("Account holder")}</Label>
      <Input id="bank-holder" disabled value={d?.account_holder ?? ""} placeholder={t("Not set yet")} />
      </div><StudioSoon label="Branch (optional)" /></div><h2 className="pt-6 border-t">{t("UAE transfer")} <span className="it">{t("details")}</span></h2><Label htmlFor="bank-iban">{t("IBAN")}</Label>
      <Input id="bank-iban" dir="ltr" disabled value={d ? maskIban(d.iban) : ""} placeholder={t("AE00 •••• •••• ••••")} />
<div className="grid gap-4 sm:grid-cols-2"><StudioSoon label="SWIFT / BIC" /><StudioSoon label="Emirates ID" /><div><Label>{t("Country")}</Label><Input disabled value={"United Arab Emirates"} /></div><div><Label>{t("Currency")}</Label><Input disabled value={"AED"} /></div></div>
    </section>
  );
}
