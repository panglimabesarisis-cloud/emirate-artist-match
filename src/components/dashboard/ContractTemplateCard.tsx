import { Eye } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import "./contract-library.css";

/** Reference card shell shared by the artist and master-admin libraries. */
export function ContractTemplateCard({ name, category, tier, tierName, articles, updatedAt, usage, details, actions, primary, onPreview }: {
  name: string; category: string | null; tier: string; tierName: string; articles?: number;
  updatedAt?: string; usage?: number; details?: ReactNode; actions?: ReactNode;
  primary: ReactNode; onPreview: () => void;
}) {
  const { t } = useI18n();
  return <article className="contract-template-card">
    <span className="contract-tier-ribbon" data-tier={tier}>{tierName}</span>
    <span className="contract-document-icon" aria-hidden="true"><i /><i /><i /><i /><i /></span>
    <div className="contract-card-meta"><span>{category ?? t("Other")}</span>{usage !== undefined && <small>{usage} {t("in use")}</small>}</div>
    <h3>{name}</h3>
    <p className="contract-card-caption">{articles !== undefined && <span>{articles} {t("articles")}</span>}{updatedAt && <span>{t("Updated")} {new Date(updatedAt).toLocaleDateString("en-GB")}</span>}</p>
    {details}
    <div className="contract-card-actions"><Button size="sm" variant="ghost" onClick={onPreview} aria-label={`${t("View")} ${name}`}><Eye />{t("View")}</Button>{actions}</div>
    <div className="contract-card-primary">{primary}</div>
  </article>;
}