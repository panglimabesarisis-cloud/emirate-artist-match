import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { checkVideo } from "@/lib/agent-media.functions";
import { useI18n } from "@/lib/i18n";

export type Media = { kind: "image" | "video"; path?: string | undefined; job?: string | undefined; failed?: boolean | undefined };

/** A picture or video the agent made, read through a short-lived private link. */
export function AgentMedia({ item, messageId }: { item: Media; messageId?: string | undefined }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const check$ = useServerFn(checkVideo);
  const link = useQuery({
    queryKey: ["agent-media", item.path], enabled: !!item.path, staleTime: 50 * 60_000,
    queryFn: async () => {
      const r = await supabase.storage.from("agent-chat").createSignedUrl(item.path!, 3600);
      if (r.error) throw r.error;
      return r.data.signedUrl;
    },
  });
  const waiting = !item.path && !item.failed && !!item.job && !!messageId;
  const job = useQuery({
    queryKey: ["agent-video", messageId, item.job], enabled: waiting,
    refetchInterval: (q) => (q.state.data?.status && q.state.data.status !== "pending" ? false : 10_000),
    queryFn: () => check$({ data: { messageId: messageId!, job: item.job! } }),
  });
  const finished = job.data?.status && job.data.status !== "pending";
  useEffect(() => { if (finished) void qc.invalidateQueries({ queryKey: ["agent-chat-msgs"] }); }, [finished, qc]);
  if (item.failed) return <p role="alert" className="text-sm text-destructive">{t("The video could not be created. Try another description.")}</p>;
  if (!item.path) return <p role="status" className="flex items-center gap-2 rounded-xl border border-border p-4 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t("Creating your video. This takes a few minutes.")}</p>;
  if (link.error) return <p role="alert" className="text-sm text-destructive">{t("This file could not be opened.")}</p>;
  if (!link.data) return <p role="status" className="text-sm text-muted-foreground">{t("Loading…")}</p>;
  return (
    <figure className="space-y-2">
      {item.kind === "image"
        ? <img src={link.data} alt={t("Picture made by your agent")} className="max-h-[480px] max-w-full rounded-xl border border-border" />
        : <video src={link.data} controls playsInline className="max-h-[480px] max-w-full rounded-xl border border-border" />}
      <figcaption><a href={link.data} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center gap-1.5 text-sm underline"><Download className="h-4 w-4" aria-hidden />{t("Download")}</a></figcaption>
    </figure>
  );
}
