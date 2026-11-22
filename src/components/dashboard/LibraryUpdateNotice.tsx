import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { libraryRefresh } from "@/lib/library-query";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";

export function LibraryUpdateNotice({ artistId, kind }: { artistId: string; kind: "flow_template" | "form_template" }) {
  const { t } = useI18n();
  const query = useQuery({ queryKey: ["library-updates", artistId], ...libraryRefresh, queryFn: async () => {
    const { data, error } = await supabase.rpc("library_updates", { _artist: artistId });
    if (error) throw error;
    return data ?? [];
  } });
  const rows = query.data?.filter((row) => row.kind === kind) ?? [];
  if (!rows.length) return null;
  return <div className="mb-4 flex flex-wrap gap-2">{rows.map((row) => <Badge key={row.source_template_id} variant="outline">{row.template_name} · {t("Update available")} · v{row.source_version} → v{row.current_version}</Badge>)}</div>;
}