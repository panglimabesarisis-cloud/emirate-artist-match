import { rateItems, type StoredRate } from "@/lib/ratecard";
import { aed } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export function RatecardDetails({ rate }: { rate: StoredRate }) {
  const { t } = useI18n();
  return <div className="space-y-3 text-sm">
    <div className="dmr-rc-exp-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rateItems(rate).map((item, index) => <div key={index} className="dmr-rc-item flex items-start justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <span className={`dmr-rc-tag ${item.type === "base" ? "base" : "addon text-gold"}`}>{t(item.type === "base" ? "Base package" : "Add-on / extra")}</span>
        <h4 className="mt-1 break-words font-medium">{item.desc}</h4>
        <p className="text-xs text-muted-foreground">{item.qty} {t(item.unit)}</p>
      </div>
      <b className="whitespace-nowrap" dir="ltr">{aed(item.price)}</b>
    </div>)}</div>
    <div className="dmr-rc-exp-meta space-y-2">
      {rate.description && <p className="whitespace-pre-wrap"><b>{t("Included")}: </b>{rate.description}</p>}
      {rate.rules_of_work && <p className="whitespace-pre-wrap"><b>{t("Rules of work")}: </b>{rate.rules_of_work}</p>}
    </div>
  </div>;
}
