import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Named = { id: string; name: string };

/** Names talents asked for. The spelling can be corrected before approving; a rejection needs a reason. */
export function CatalogRequestQueue({ categories, onDecided }: { categories: Named[]; onDecided: () => Promise<unknown> }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-catalog-requests", "list"],
    queryFn: async () => {
      const r = await supabase.from("catalog_suggestions").select("id, kind, name, category_id, parent_id, created_at, artists(stage_name)").eq("status", "pending").order("created_at").limit(200);
      if (r.error) throw new Error("Unable to load requests from talents");
      return r.data ?? [];
    },
  });
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const rows = query.data ?? [];
  if (query.error) return <p role="alert" className="adm-empty text-destructive">Unable to load requests from talents.</p>;
  if (!rows.length) return null;
  const under = (r: (typeof rows)[number]) => (r.kind === "category" ? "New category" : r.category_id ? `Speciality in ${categories.find((c) => c.id === r.category_id)?.name ?? "—"}` : `Speciality in new category "${rows.find((p) => p.id === r.parent_id)?.name ?? "—"}"`);
  const decide = async (id: string, approve: boolean) => {
    let note = "";
    if (!approve) {
      note = (prompt("Why is this not approved? The talent sees this. (at least 5 characters)") ?? "").trim();
      if (!note) return;
      if (note.length < 5) { toast.error("Write at least 5 characters"); return; }
    }
    setBusy(id);
    const name = names[id]?.trim();
    const { data, error } = await supabase.rpc("decide_catalog_suggestion", { _id: id, _approve: approve, ...(name ? { _name: name } : {}), ...(note ? { _note: note } : {}) });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(!approve ? "Request not approved" : data ? "Approved and added to the profile" : "Approved. The talent's plan has no room, so they choose it themselves.");
    await Promise.all([qc.invalidateQueries({ queryKey: ["admin-catalog-requests"] }), onDecided()]);
  };
  return (
    <section className="adm-panel" aria-labelledby="catalog-requests-title">
      <h2 id="catalog-requests-title" className="font-display">Requested by talents ({rows.length})</h2>
      <div className="admin-table-wrap"><table><thead><tr><th>Talent</th><th>Request</th><th>Name</th><th>Action</th></tr></thead><tbody>
        {rows.map((r) => {
          const waiting = r.kind === "speciality" && !r.category_id;
          return (
            <tr key={r.id}>
              <td><b>{r.artists?.stage_name ?? "—"}</b></td>
              <td>{under(r)}{waiting && <div className="admin-row-detail">Approve the category first</div>}</td>
              <td><Input aria-label={`Name for ${r.name}`} maxLength={40} dir="auto" value={names[r.id] ?? r.name} onChange={(e) => setNames({ ...names, [r.id]: e.target.value })} /></td>
              <td><div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy !== null || waiting} onClick={() => void decide(r.id, true)}>Approve</Button><Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void decide(r.id, false)}>Reject</Button></div></td>
            </tr>
          );
        })}
      </tbody></table></div>
    </section>
  );
}
