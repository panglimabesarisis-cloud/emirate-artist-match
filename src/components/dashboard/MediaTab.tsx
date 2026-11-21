import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Image as ImageIcon, Film, Youtube, UploadCloud } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { youtubeId } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StudioHeading, StudioSection, StudioSoon } from "./StudioPage";

const BUCKET = "artist-media";

export function MediaTab({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const [drag, setDrag] = useState(false);
  const qc = useQueryClient();
  const key = ["artist-media", artistId];
  const { data: items } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const rows = (await supabase.from("artist_media").select("id, kind, url, storage_path, caption, sort").eq("artist_id", artistId).order("sort").order("created_at")).data ?? [];
      const paths = rows.filter((r) => r.storage_path).map((r) => r.storage_path!);
      const signed = paths.length ? (await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)).data ?? [] : [];
      return rows.map((r) => ({ ...r, src: r.storage_path ? signed.find((s) => s.path === r.storage_path)?.signedUrl ?? "" : r.url }));
    },
  });
  const [busy, setBusy] = useState(false);
  const [yt, setYt] = useState("");

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const kind = file.type.startsWith("image/") ? "photo" : file.type.startsWith("video/") ? "video" : null;
        if (!kind) { toast.error(`${file.name}: only photos or videos`); continue; }
        if (file.size > 50 * 1024 * 1024) { toast.error(`${file.name}: max 50 MB`); continue; }
        const path = `${artistId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
        if (error) { toast.error(`${file.name}: upload failed`); continue; }
        const save=await supabase.from("artist_media").insert({ artist_id: artistId, kind, url: path, storage_path: path, sort: (items?.length ?? 0) + 1 });
        if(save.error){await supabase.storage.from(BUCKET).remove([path]);throw new Error(save.error.message);}
      }
      toast.success(t("Media uploaded"));
      qc.invalidateQueries({ queryKey: key });
    } catch(e){toast.error(e instanceof Error?e.message:'Upload failed');} finally { setBusy(false); }
  };

  const addYoutube = async () => {
    const id = youtubeId(yt);
    if (!id) { toast.error(t("Paste a valid YouTube link")); return; }
    const { error } = await supabase.from("artist_media").insert({ artist_id: artistId, kind: "youtube", url: `https://www.youtube.com/watch?v=${id}`, sort: (items?.length ?? 0) + 1 });
    if (error) { toast.error(t("Could not add video")); return; }
    setYt(""); toast.success(t("YouTube video added")); qc.invalidateQueries({ queryKey: key });
  };

  const remove = async (m: { id: string; storage_path: string | null }) => {
    if (!confirm(t("Remove this item?"))) return;
    if (m.storage_path) await supabase.storage.from(BUCKET).remove([m.storage_path]);
    await supabase.from("artist_media").delete().eq("id", m.id);
    qc.invalidateQueries({ queryKey: key });
  };

  return (
    <div className="dmr-wrap dmr-mdpage"><StudioHeading title="Photos" accent="and videos"><div className="dmr-q-stats">{["photo","video","youtube"].map(kind=><div key={kind} className="dmr-qs"><small>{t(kind)}</small><b>{items?.filter(m=>m.kind === kind).length ?? 0}</b></div>)}</div></StudioHeading>
      <div className="dmr-c-12 grid gap-4 md:grid-cols-2">
        <label
          className={`studio-media-upload flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed p-6 text-center transition-colors ${drag ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/60"}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); }}
        >
          <UploadCloud className="h-8 w-8 text-primary" aria-hidden />
          <span className="font-medium">{busy ? t("Uploading…") : t("Drop photos or videos here, or click to browse")}</span>
          <span className="text-xs text-muted-foreground">{t("Up to 50 MB per file. Photos show in the slider on your profile, videos below it.")}</span>
          <input type="file" className="sr-only" accept="image/*,video/*" multiple disabled={busy} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
        </label>
        <div className="studio-media-youtube space-y-2">
          <h2>{t("Add a")} <span className="it">{t("YouTube video")}</span></h2><Label htmlFor="yt-link">{t("Add a YouTube video")}</Label>
          <div className="flex gap-2"><Input id="yt-link" placeholder={t("https://youtube.com/watch?v=…")} value={yt} onChange={(e) => setYt(e.target.value)} /><Button onClick={addYoutube}>{t("Add")}</Button></div>
        </div>
      </div>
      <section className="dmr-panel dmr-c-12"><div className="dmr-ph"><h2>{t("Your")} <span className="it">{t("gallery")}</span></h2></div>{items?.length === 0 && <p className="text-muted-foreground">{t("No media yet.")}</p>}
      <div className="studio-media-grid">
        {items?.map((m) => (
          <div key={m.id} className="studio-media-item">
            <div className="aspect-video bg-muted">
              {m.kind === "photo" && <img src={m.src} alt="" className="h-full w-full object-cover" />}
              {m.kind === "video" && <video src={m.src} className="h-full w-full object-cover" muted />}
              {m.kind === "youtube" && <img src={`https://img.youtube.com/vi/${youtubeId(m.url)}/hqdefault.jpg`} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="flex items-center justify-between p-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">{m.kind === "photo" ? <ImageIcon className="h-3 w-3" /> : m.kind === "video" ? <Film className="h-3 w-3" /> : <Youtube className="h-3 w-3" />}{m.kind}</span>
              <Button variant="ghost" size="icon" type="button" aria-label={t("Remove")} onClick={() => remove(m)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
      </div><div className="grid gap-3 sm:grid-cols-2 mt-5"><StudioSoon label="Reorder gallery" /><StudioSoon label="Cover photo" /></div></section>
    </div>
  );
}
