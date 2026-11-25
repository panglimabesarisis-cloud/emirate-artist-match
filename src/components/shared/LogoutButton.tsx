import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import "./logout-button.css";

/** Top-right sign out shared by every dashboard. */
export function LogoutButton() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    await qc.cancelQueries();
    const { error } = await supabase.auth.signOut();
    if (error) { setBusy(false); toast.error(t("Could not sign out")); return; }
    qc.clear();
    // A full load drops every piece of signed-in state held in memory.
    window.location.assign("/auth");
  };
  return (
    <button type="button" className="dm-logout" disabled={busy} onClick={() => void logout()} aria-label={t("Log out")} title={t("Log out")}>
      <LogOut aria-hidden="true" />
      <span>{t("Log out")}</span>
    </button>
  );
}
