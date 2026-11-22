import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Play, Plus, Star, Trash2, UploadCloud } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { youtubeId } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StudioHeading } from "./StudioPage";

const BUCKET = "artist-media";
const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

type Item = { id: string; kind: string; url: string; storage_path: string | null; caption: string | null; sort: number; is_cover: boolean; src: string };
const isVideo = (i: Item) => i.kind !== "photo";
const thumbOf = (i: Item) => (i.kind === "youtube" ? `https://i.ytimg.com/vi/${youtubeId(i.url) ?? ""}/hqdefault.jpg` : i.src);

/** Photos and videos for the artist's profile, as in the design reference: upload, YouTube links, gallery with cover, order and a viewer. */
export function MediaTab({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const key = ["artist-media", artistId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const rows = (await supabase.from("artist_media").select("id, kind, url, storage_path, caption, sort, is_cover").eq("artist_id", artistId).order("sort").order("created_at")).data ?? [];
      const paths = rows.filter((r) => r.storage_path).map((r) => r.storage_path!);
      const signed = paths.length ? (await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)).data ?? [] : [];
      return rows.map((r) => ({ ...r, src: r.storage_path ? (signed.find((s) => s.path === r.storage_path)?.signedUrl ?? "") : r.url })) as Item[];
    },
  });
  const [hidden, setHidden] = useState<string[]>([]);
  const items = useMemo(() => (data ?? []).filter((i) => !hidden.includes(i.id)), [data, hidden]);
  const [tab, setTab] = useState<"all" | "photo" | "video">("all");
  const [uploading, setUploading] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [yt, setYt] = useState("");
  const [ytErr, setYtErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const timers = useRef(new Map<string, number>());

  const photos = items.filter((i) => !isVideo(i)), videos = items.filter(isVideo);
  const view = items.filter((i) => tab === "all" || (tab === "photo") !== isVideo(i));
  const current = open ? items.find((i) => i.id === open) ?? null : null;
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  useEffect(() => { setCaption(current?.caption ?? ""); }, [current?.id, current?.caption]);

  const add = async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    let ok = 0;
    let order = (data?.length ?? 0) + 1;
    for (const f of list) {
      const kind = f.type.startsWith("image/") ? "photo" : f.type.startsWith("video/") ? "video" : null;
      if (!kind || !ACCEPT.split(",").includes(f.type)) { toast.error(`${f.name}: ${t("only JPG, PNG, WebP, MP4, WebM or MOV")}`); continue; }
      if (f.size > MAX_BYTES) { toast.error(`${f.name}: ${t("max 50 MB")}`); continue; }
      setUploading((u) => [...u, f.name]);
      const path = `${artistId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
      const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type });
      if (up.error) { setUploading((u) => u.filter((n) => n !== f.name)); toast.error(`${f.name}: ${t("upload failed")}`); continue; }
      const save = await supabase.from("artist_media").insert({ artist_id: artistId, kind, url: path, storage_path: path, sort: order++, is_cover: kind === "photo" && photos.length === 0 && ok === 0 && !items.some((i) => i.is_cover) });
      setUploading((u) => u.filter((n) => n !== f.name));
      if (save.error) { await supabase.storage.from(BUCKET).remove([path]); toast.error(save.error.message); continue; }
      ok++;
    }
    if (ok) { toast.success(`${ok} ${t(ok === 1 ? "file uploaded" : "files uploaded")}`); void refresh(); }
  };

  const addYoutube = async () => {
    const id = youtubeId(yt);
    if (!yt.trim()) { setYtErr(t("Paste a YouTube link.")); return; }
    if (!id) { setYtErr(t("That does not look like a YouTube link.")); return; }
    if (items.some((i) => i.kind === "youtube" && youtubeId(i.url) === id)) { setYtErr(t("This video is already in your gallery.")); return; }
    const { error } = await supabase.from("artist_media").insert({ artist_id: artistId, kind: "youtube", url: `https://www.youtube.com/watch?v=${id}`, sort: (data?.length ?? 0) + 1 });
    if (error) { toast.error(t("Could not add video")); return; }
    setYt(""); setYtErr(""); toast.success(t("YouTube video added")); void refresh();
  };

  const setCover = async (i: Item) => {
    if (isVideo(i) || i.is_cover) return;
    const a = await supabase.from("artist_media").update({ is_cover: false }).eq("artist_id", artistId).eq("is_cover", true);
    const b = await supabase.from("artist_media").update({ is_cover: true }).eq("id", i.id);
    if (a.error || b.error) { toast.error(t("Could not set the cover photo")); return; }
    toast.success(t("Cover photo set. Clients see it first.")); void refresh();
  };

  const persistOrder = async (list: Item[]) => {
    const changed = list.map((x, idx) => ({ x, sort: idx + 1 })).filter(({ x, sort }) => x.sort !== sort);
    qc.setQueryData(key, list.map((x, idx) => ({ ...x, sort: idx + 1 })));
    await Promise.all(changed.map(({ x, sort }) => supabase.from("artist_media").update({ sort }).eq("id", x.id)));
    void refresh();
  };
  const move = (i: Item, d: number) => {
    const all = [...items];
    const from = all.findIndex((x) => x.id === i.id), to = from + d;
    if (to < 0 || to >= all.length) return;
    [all[from], all[to]] = [all[to]!, all[from]!];
    void persistOrder(all);
  };
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const all = [...items];
    const from = all.findIndex((x) => x.id === dragId), to = all.findIndex((x) => x.id === targetId);
    const [m] = all.splice(from, 1);
    all.splice(to, 0, m!);
    void persistOrder(all);
  };

  /** Delete with a few seconds to undo: the row and the stored file go only when the time is up. */
  const remove = (i: Item) => {
    setHidden((h) => [...h, i.id]);
    if (open === i.id) setOpen(null);
    const timer = window.setTimeout(async () => {
      timers.current.delete(i.id);
      if (i.storage_path) await supabase.storage.from(BUCKET).remove([i.storage_path]);
      await supabase.from("artist_media").delete().eq("id", i.id);
      if (i.is_cover) { const next = (data ?? []).find((x) => x.id !== i.id && !isVideo(x)); if (next) await supabase.from("artist_media").update({ is_cover: true }).eq("id", next.id); }
      setHidden((h) => h.filter((x) => x !== i.id));
      void refresh();
    }, 6000);
    timers.current.set(i.id, timer);
    toast(t(i.kind === "photo" ? "Photo deleted" : "Video deleted"), { duration: 6000, action: { label: t("Undo"), onClick: () => { window.clearTimeout(timers.current.get(i.id)); timers.current.delete(i.id); setHidden((h) => h.filter((x) => x !== i.id)); } } });
  };

  const stepOpen = (d: number) => { const list = view; const k = list.findIndex((x) => x.id === open); const n = list[k + d]; if (n) setOpen(n.id); };
  const saveCaption = async () => {
    if (!current || (current.caption ?? "") === caption.trim()) return;
    const { error } = await supabase.from("artist_media").update({ caption: caption.trim() || null }).eq("id", current.id);
    if (error) { toast.error(error.message); return; }
    void refresh();
  };

  const stat = (label: string, n: number, gold = false) => <div className="dmr-qs" key={label}><small>{t(label)}</small><b className={gold ? "text-gold" : ""} style={{ fontSize: 26 }}>{n}</b></div>;
  const tabs: [typeof tab, string, number][] = [["all", "All", items.length], ["photo", "Photos", photos.length], ["video", "Videos", videos.length]];

  return (
    <div className="dmr-wrap dmr-mdpage">
      <StudioHeading title="Photos" accent="and videos"><div className="dmr-q-stats">{stat("Photos", photos.length, true)}{stat("Videos", videos.length)}</div></StudioHeading>
      <p className="dmr-c-12 -mt-2 text-sm text-muted-foreground">{t("Photos fill the slider on your profile and videos sit below it. Drag to reorder, and pick a cover photo clients see first.")}</p>

      <div className="studio-media-top">
        <section className="dmr-panel" aria-labelledby="md-uh">
          <h2 id="md-uh" className="mb-3.5 font-display text-[26px] leading-none">{t("Upload")} <span className="it">{t("files")}</span></h2>
          <div role="button" tabIndex={0} aria-label={t("Upload photos or videos. Choose files or drop them here.")} onClick={() => file.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.current?.click(); } }}
            onDragEnter={(e) => { e.preventDefault(); setDrag(true); }} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); void add(e.dataTransfer.files); }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-5 py-9 text-center transition-colors ${drag ? "border-gold bg-gold/[.08]" : "border-border hover:border-gold/60"}`}>
            <span className="grid h-14 w-14 place-items-center rounded-full border border-gold/25 bg-gold/10 text-gold"><UploadCloud className="h-6 w-6" aria-hidden /></span>
            <b className="text-[15px]">{uploading.length ? `${t("Uploading")} ${uploading.length}…` : <>{t("Drop files here or")} <u className="decoration-gold/50 underline-offset-4">{t("choose files")}</u></>}</b>
            <small className="max-w-sm text-xs text-muted-foreground">{t("JPG, PNG, WebP, MP4, WebM or MOV. Up to 50 MB each. Wide photos, at least 1200 px, look best.")}</small>
          </div>
          <input ref={file} type="file" accept={ACCEPT} multiple className="sr-only" onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
        </section>
        <section className="dmr-panel" aria-labelledby="md-yh">
          <h2 id="md-yh" className="mb-3.5 font-display text-[26px] leading-none">{t("Add a")} <span className="it">{t("YouTube video")}</span></h2>
          <form className="flex items-start gap-2.5" onSubmit={(e) => { e.preventDefault(); void addYoutube(); }} noValidate>
            <div className="min-w-0 flex-1 space-y-2"><label htmlFor="md-yu" className="text-[11px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{t("YouTube link")}</label>
              <input id="md-yu" inputMode="url" autoComplete="off" placeholder="https://youtube.com/watch?v=..." value={yt} onChange={(e) => { setYt(e.target.value); setYtErr(""); }} aria-describedby="md-yu-h" aria-invalid={!!ytErr} className="h-11 w-full rounded-xl border border-border bg-foreground/[.03] px-3.5 text-sm outline-none focus-visible:border-gold" />
              <span id="md-yu-h" className={`block min-h-4 text-xs ${ytErr ? "text-[#ff8a7a]" : "text-muted-foreground/70"}`}>{ytErr}</span></div>
            <Button type="submit" className="mt-[26px] rounded-full bg-gradient-gold font-bold text-gold-foreground"><Plus className="me-1.5 h-3.5 w-3.5" />{t("Add")}</Button>
          </form>
          <p className="mt-2 rounded-xl bg-foreground/[.04] px-3.5 py-3 text-xs text-muted-foreground"><b className="text-foreground">{t("Tip.")}</b> {t("Links from youtube.com, youtu.be and Shorts all work. Videos play inside your profile, so clients stay on your page.")}</p>
        </section>
      </div>

      <section className="dmr-panel dmr-q-panel dmr-c-12 !p-0" aria-labelledby="md-gh">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <div className="me-auto"><h2 id="md-gh" className="font-display text-[28px] leading-none">{t("Your")} <span className="it">{t("gallery")}</span></h2>
            <small className="text-xs text-muted-foreground">{items.length ? `${photos.length} ${t(photos.length === 1 ? "photo" : "photos")} ${t("and")} ${videos.length} ${t(videos.length === 1 ? "video" : "videos")}. ${t("Drag a card to reorder.")}` : t("Nothing uploaded yet")}</small></div>
          <div className="flex gap-0.5 rounded-xl bg-foreground/[.04] p-[3px]" role="group" aria-label={t("Filter gallery")}>{tabs.map(([k, l, n]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`rounded-[10px] px-3.5 py-1.5 text-[13px] font-semibold ${tab === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{t(l)} <span className="opacity-60">{n}</span></button>)}</div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4 p-5">
          {uploading.map((n) => <article key={n} className="overflow-hidden rounded-2xl border border-border"><div className="grid aspect-[4/3] place-items-center bg-foreground/[.04] px-3 text-center text-xs text-muted-foreground"><span className="truncate">{n}</span></div><div className="px-3 py-2.5 text-xs text-muted-foreground">{t("Uploading")}…</div></article>)}
          {view.map((i) => {
            const v = isVideo(i);
            return (
              <article key={i.id} draggable onDragStart={(e) => { setDragId(i.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", i.id); } catch { /* some browsers refuse */ } }} onDragEnd={() => { setDragId(null); setOverId(null); }}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(i.id); } }} onDragLeave={() => setOverId(null)} onDrop={(e) => { e.preventDefault(); dropOn(i.id); setOverId(null); }}
                className={`overflow-hidden rounded-2xl border bg-foreground/[.02] transition-[opacity,border-color] ${dragId === i.id ? "opacity-40" : ""} ${overId === i.id ? "border-gold" : "border-border"}`}>
                <button type="button" onClick={() => setOpen(i.id)} aria-label={`${t("Open")} ${i.caption || t(v ? "video" : "photo")}`} className="relative block aspect-[4/3] w-full overflow-hidden bg-[#0d1222]">
                  {i.kind === "video" ? <video src={`${i.src}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" /> : <img src={thumbOf(i)} alt={i.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />}
                  {v && <span className="absolute inset-0 grid place-items-center"><i className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white"><Play className="h-5 w-5 fill-current" /></i></span>}
                  <span className="absolute start-2.5 top-2.5 flex flex-wrap gap-1.5 text-[10.5px] font-extrabold">
                    {i.is_cover && <span className="rounded-full bg-gradient-gold px-2.5 py-0.5 text-gold-foreground">{t("Cover")}</span>}
                    <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-white">{i.kind === "youtube" ? "YouTube" : t(v ? "Video" : "Photo")}</span>
                  </span>
                </button>
                <div className="flex items-center gap-1 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" title={i.caption ?? ""}>{i.caption || t(v ? "Untitled video" : "Untitled photo")}</span>
                  {!v && <button type="button" aria-pressed={i.is_cover} aria-label={t(i.is_cover ? "Cover photo" : "Set as cover photo")} onClick={() => void setCover(i)} className={`grid h-8 w-8 place-items-center rounded-lg hover:bg-foreground/10 ${i.is_cover ? "text-gold" : "text-muted-foreground"}`}><Star className={`h-4 w-4 ${i.is_cover ? "fill-current" : ""}`} /></button>}
                  <button type="button" aria-label={t("Move earlier")} disabled={items[0]?.id === i.id} onClick={() => move(i, -1)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/10 disabled:opacity-30"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></button>
                  <button type="button" aria-label={t("Move later")} disabled={items[items.length - 1]?.id === i.id} onClick={() => move(i, 1)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/10 disabled:opacity-30"><ChevronRight className="h-4 w-4 rtl:rotate-180" /></button>
                  <button type="button" aria-label={t("Delete")} onClick={() => remove(i)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-red-500/15 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                </div>
              </article>
            );
          })}
          {view.length === 0 && uploading.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-1.5 px-5 py-10 text-center"><b className="font-display text-2xl font-normal">{t(tab === "video" ? "No videos yet" : tab === "photo" ? "No photos yet" : "Your gallery is empty")}</b><p className="text-[13px] text-muted-foreground">{t(tab === "video" ? "Paste a YouTube link or upload a video file." : "Drop photos in the box above to get started.")}</p></div>
          )}
        </div>
      </section>

      <Dialog open={!!current} onOpenChange={(o) => { if (!o) { void saveCaption(); setOpen(null); } }}>
        <DialogContent aria-label={t("Media viewer")} className="max-w-4xl gap-3 border-border bg-[#080b14] p-4 [&>button.absolute]:hidden">
          <DialogTitle className="sr-only">{t("Media viewer")}</DialogTitle>
          <DialogDescription className="sr-only">{current?.caption ?? ""}</DialogDescription>
          {current && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2.5"><span className="text-[13px] text-muted-foreground">{view.findIndex((x) => x.id === current.id) + 1} {t("of")} {view.length}</span>
                <div className="flex flex-wrap gap-2">
                  {!isVideo(current) && <Button type="button" variant="outline" className="rounded-full" disabled={current.is_cover} onClick={() => void setCover(current)}>{t(current.is_cover ? "Cover photo" : "Set as cover")}</Button>}
                  <Button type="button" variant="outline" className="rounded-full" onClick={() => remove(current)}>{t("Delete")}</Button>
                  <Button type="button" className="rounded-full bg-gradient-gold font-bold text-gold-foreground" onClick={() => { void saveCaption(); setOpen(null); }}>{t("Close")}</Button>
                </div></div>
              <div className="relative grid min-h-[260px] place-items-center overflow-hidden rounded-xl bg-black">
                {current.kind === "youtube" ? <iframe className="aspect-video w-full" src={`https://www.youtube-nocookie.com/embed/${youtubeId(current.url) ?? ""}?rel=0`} title={current.caption ?? "YouTube video"} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />
                  : current.kind === "video" ? <video src={current.src} controls playsInline className="max-h-[68vh] w-full" /> : <img src={current.src} alt={current.caption ?? ""} className="max-h-[68vh] w-full object-contain" />}
                <button type="button" aria-label={t("Previous")} disabled={view.findIndex((x) => x.id === current.id) <= 0} onClick={() => stepOpen(-1)} className="absolute start-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white disabled:opacity-30"><ChevronLeft className="h-5 w-5 rtl:rotate-180" /></button>
                <button type="button" aria-label={t("Next")} disabled={view.findIndex((x) => x.id === current.id) >= view.length - 1} onClick={() => stepOpen(1)} className="absolute end-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white disabled:opacity-30"><ChevronRight className="h-5 w-5 rtl:rotate-180" /></button>
              </div>
              <div className="flex flex-wrap items-center gap-3"><input value={caption} maxLength={80} autoComplete="off" placeholder={t("Add a caption")} aria-label={t("Caption")} onChange={(e) => setCaption(e.target.value)} onBlur={() => void saveCaption()} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveCaption(); } }} className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-foreground/[.04] px-3.5 text-sm outline-none focus-visible:border-gold" />
                <small className="text-xs text-muted-foreground">{current.kind === "youtube" ? "YouTube" : t(isVideo(current) ? "Video file" : "Photo")}</small></div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
