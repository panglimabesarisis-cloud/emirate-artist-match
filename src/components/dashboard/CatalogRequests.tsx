import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

type Named = { id: string; name: string };
const TONE: Record<string, string> = { pending: "Waiting for approval", approved: "Approved", rejected: "Not approved" };

/**
 * Asking for a category or speciality that is not listed. An administrator approves it before it appears
 * anywhere; nothing here changes the profile form.
 */
export function useCatalogRequests(artistId: string | undefined, selected: Named[]): { askCategory?: (name: string) => void; askSpeciality?: (name: string) => void; panel: ReactNode } {
  const { t } = useI18n();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["catalog-requests", artistId],
    enabled: !!artistId,
    queryFn: async () => {
      const r = await supabase.from("catalog_suggestions").select("id, kind, name, category_id, parent_id, status, admin_note").eq("artist_id", artistId!).order("created_at", { ascending: false }).limit(30);
      if (r.error) throw new Error("Unable to load your requests");
      return r.data ?? [];
    },
  });
  // A speciality waiting for the talent to say which category it belongs to.
  const [choosing, setChoosing] = useState<string | null>(null);
  if (!artistId) return { panel: null };
  const rows = query.data ?? [];
  const parents = [
    ...selected.map((c) => ({ key: c.id, name: c.name, category: c.id, parent: undefined as string | undefined })),
    ...rows.filter((r) => r.kind === "category" && r.status === "pending").map((r) => ({ key: r.id, name: `${r.name} (${t("waiting")})`, category: undefined as string | undefined, parent: r.id })),
  ];
  const refresh = () => qc.invalidateQueries({ queryKey: ["catalog-requests", artistId] });
  const send = async (kind: "category" | "speciality", name: string, under?: (typeof parents)[number]) => {
    const { error } = await supabase.rpc("suggest_catalog_entry", { _artist: artistId, _kind: kind, _name: name, ...(under?.category ? { _category: under.category } : {}), ...(under?.parent ? { _parent: under.parent } : {}) });
    setChoosing(null);
    if (error) { toast.error(t(error.message)); return; }
    toast.success(t("Sent for approval"));
    await refresh();
  };
  const askSpeciality = (name: string) => {
    if (!parents.length) { toast.error(t("Add a category first")); return; }
    if (parents.length === 1) void send("speciality", name, parents[0]);
    else setChoosing(name);
  };
  const withdraw = async (id: string) => {
    const r = await supabase.from("catalog_suggestions").delete().eq("id", id).select("id");
    if (r.error || !r.data?.length) toast.error(t("Could not withdraw this request"));
    await refresh();
  };
  const panel = (choosing || rows.length > 0) && (
    <div className="dmr-full grid gap-2">
      {choosing && (
        <div role="group" aria-label={t("Choose a category")} className="flex flex-wrap items-center gap-2 rounded-xl border border-gold/40 bg-gold/[.07] p-3 text-sm">
          <span>{t("In which category is")} <b>{choosing}</b>?</span>
          {parents.map((p) => <button key={p.key} type="button" className="dmr-btn dmr-btn-line" onClick={() => void send("speciality", choosing, p)}>{p.name}</button>)}
          <button type="button" className="text-muted-foreground underline" onClick={() => setChoosing(null)}>{t("Cancel")}</button>
        </div>
      )}
      {rows.length > 0 && (
        <ul className="grid gap-1.5" aria-label={t("Your requests for new names")}>
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
              <b dir="auto">{r.name}</b><span className="text-xs text-muted-foreground">{t(r.kind === "category" ? "Category" : "Speciality")}</span>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${r.status === "approved" ? "border-emerald-400/40 text-emerald-300" : r.status === "rejected" ? "border-red-400/40 text-red-300" : "border-gold/40 text-gold"}`}>{t(TONE[r.status] ?? r.status)}</span>
              {r.admin_note && <span className="text-xs text-muted-foreground" dir="auto">{r.admin_note}</span>}
              {r.status === "pending" && <button type="button" className="ms-auto text-xs text-muted-foreground underline" onClick={() => void withdraw(r.id)}>{t("Withdraw")}</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return { askCategory: (name) => void send("category", name), askSpeciality, panel };
}
