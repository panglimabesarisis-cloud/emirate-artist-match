import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { LogoutButton } from "./LogoutButton";
import { useOtpSetting, WhatsAppVerify } from "./WhatsAppVerify";

/** The signed-in account's verified WhatsApp number. */
export function useAccountPhone(userId: string | undefined) {
  return useQuery({
    queryKey: ["account-phone", userId], enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("phone,phone_verified_at").eq("id", userId!).maybeSingle();
      if (error) throw new Error(error.message);
      return { phone: data?.phone ?? "", verified: !!data?.phone_verified_at };
    },
  });
}

/** Asks a signed-in person to verify their number. */
export function AccountWhatsAppCard({ userId }: { userId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const account = useAccountPhone(userId);
  const [phone, setPhone] = useState("");
  useEffect(() => { if (account.data?.phone) setPhone((current) => current || account.data!.phone); }, [account.data?.phone]);
  return (
    <section className="mx-auto w-full max-w-md space-y-3 rounded-2xl border bg-card p-5 text-card-foreground">
      <h2 className="text-lg font-semibold">{t("Verify your WhatsApp number")}</h2>
      <p className="text-sm text-muted-foreground">{t("A verified WhatsApp number is required. We use it for booking updates.")}</p>
      <WhatsAppVerify phone={phone} onChange={setPhone} onVerified={() => void qc.invalidateQueries({ queryKey: ["account-phone", userId] })} />
    </section>
  );
}

/** Accounts created after verification started must verify before they use the page. Earlier accounts pass. */
export function NewAccountPhoneGate({ userId, createdAt, children }: { userId: string; createdAt: string | undefined; children: ReactNode }) {
  const { t } = useI18n();
  const setting = useOtpSetting();
  const account = useAccountPhone(userId);
  if (setting.isPending || account.isPending) return <p role="status" className="p-16 text-center text-muted-foreground">{t("Loading…")}</p>;
  const since = setting.data?.since;
  const isNew = !!since && !!createdAt && new Date(createdAt) >= new Date(since);
  // A failed check never locks anyone out; bookings are still checked by the server.
  if (!setting.data?.required || !isNew || !account.data || account.data.verified) return <>{children}</>;
  return <main className="space-y-4 p-4 pt-16"><div className="flex justify-end"><LogoutButton /></div><AccountWhatsAppCard userId={userId} /></main>;
}

/** Shown inside a form that needs a verified account number; nothing once it is verified or the requirement is off. */
export function AccountPhoneIfNeeded({ userId }: { userId: string }) {
  const setting = useOtpSetting();
  const account = useAccountPhone(userId);
  if (!setting.data?.required || !account.data || account.data.verified) return null;
  return <AccountWhatsAppCard userId={userId} />;
}
