import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { aed } from "@/lib/format";
import { invoiceMoney } from "@/lib/invoice";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/shared/TierBadge";

/** "Komisi Fee": the client's paid invoices against the tier targets, and the tier table. */
export function CommissionPage() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const tiers = useQuery({
    queryKey: ["client-commission-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("client_commission_tiers").select("tier,commission_pct,target_amount,min_withdrawal").order("tier");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const mine = useQuery({
    queryKey: ["client-tier-status", user?.id], enabled: !!user, refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_tier_status");
      if (error) throw new Error(error.message);
      return data?.[0] ?? null;
    },
  });
  const status = mine.data;
  const tier = status ? Number(status.tier) : null;
  const money = (value: unknown) => (status ? aed(Number(value)) : "—");
  const stats: [string, string][] = [
    ["Invoice Paid", money(status?.paid_total)],
    ["Komisi", status ? invoiceMoney(Number(status.commission_total)) : "—"],
    ["Target", money(status?.target_amount)],
  ];

  if (tiers.isError) return <p role="alert" className="dmc-empty">{t("Data komisi belum tersedia. Silakan coba lagi nanti.")}</p>;
  return (
    <>
      {!loading && !user && (
        <article className="dmc-card dmc-row">
          <div><h2>{t("Daftar untuk memantau komisi Anda")}</h2><p>{t("Komisi dihitung untuk pembayaran dari akun yang terdaftar.")}</p></div>
          <Button asChild className="dmc-pay"><Link to="/auth" search={{ redirect: "/client/dashboard" }}>{t("Daftar")}</Link></Button>
        </article>
      )}
      {mine.isError && <p role="alert" className="dmc-empty">{t("Data komisi Anda belum tersedia. Silakan coba lagi nanti.")}</p>}
      <div className="dmc-stats">
        {stats.map(([label, value]) => <article key={label} className="dmc-card"><p>{t(label)}</p><strong>{value}</strong></article>)}
      </div>
      <article className="dmc-card">
        <div className="flex items-center gap-3">
          <TierBadge tier={tier ?? 1} size={42} />
          <div><h2>{t("Your Target")}: Tier {tier ?? 1}</h2><p>{status ? `${t("Komisi Anda saat ini")} ${Number(status.commission_pct)}%` : t("Mulai dari Tier 1.")}</p></div>
        </div>
        <ul className="dmc-bars" aria-label={t("Progres target per tier")}>
          {(tiers.data ?? []).map((row) => {
            const goal = Number(row.target_amount);
            const done = tier !== null && row.tier < tier;
            const current = tier === row.tier;
            const paid = current ? Number(status!.progress) : done ? goal : 0;
            const percent = Math.min(100, goal > 0 ? (paid / goal) * 100 : 0);
            // The last tier has nothing above it, so reaching its target changes nothing.
            const text = current ? `${aed(paid)} / ${aed(goal)}` : done ? t("Tercapai") : aed(goal);
            return (
              <li key={row.tier} className={current || (tier === null && row.tier === 1) ? "on" : ""} title={`Tier ${row.tier}: ${text}`}>
                <TierBadge tier={row.tier} size={26} />
                <span className="name">Tier {row.tier}</span>
                <span className="track" role="progressbar" aria-label={`Tier ${row.tier}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><i style={{ width: `${percent}%` }} /></span>
                <span className="value">{text}</span>
              </li>
            );
          })}
        </ul>
        <small>{t("Dihitung dari invoice yang sudah dibayar, di luar VAT. Setiap target tercapai, Anda naik satu tier dan hitungan target berikutnya mulai dari nol.")}</small>
      </article>
      <article className="dmc-card">
        <h2>{t("Komisi Fee")}</h2>
        <div className="dmc-table">
          <table>
            <thead><tr><th scope="col">Tier</th><th scope="col">{t("Komisi")}</th><th scope="col">{t("Target Withdraw")}</th></tr></thead>
            <tbody>
              {(tiers.data ?? []).map((row) => (
                <tr key={row.tier} aria-current={tier === row.tier ? "true" : undefined}>
                  <td><span className="inline-flex items-center gap-2"><TierBadge tier={row.tier} size={26} />{row.tier}</span></td>
                  <td>{Number(row.commission_pct)}%</td>
                  <td>{aed(Number(row.min_withdrawal))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}
