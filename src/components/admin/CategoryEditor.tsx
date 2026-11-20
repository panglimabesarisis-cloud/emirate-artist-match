import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { translateCategoryName } from "@/lib/catalog.functions";
import { slugify } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";

export type CategoryDraft = { id?: string; name: string; name_ar: string | null; slug: string; icon: string | null; description: string | null; sort: number | null };

export function CategoryEditor({ initial, onSaved }: { initial: CategoryDraft; onSaved: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [requestName, setRequestName] = useState("");
  const [translating, setTranslating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  const revision = useRef(0);
  const translate = useServerFn(translateCategoryName);
  useEffect(() => {
    if (!requestName.trim()) return;
    const version = revision.current;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const result = await translate({ data: { name: requestName } });
        if (active && version === revision.current) setDraft((current) => ({ ...current, name_ar: result.name }));
      } catch {
        if (active && version === revision.current) toast.error("Translation unavailable. Enter the Arabic name or retry.");
      } finally {
        if (active && version === revision.current) setTranslating(false);
      }
    }, 650);
    return () => { active = false; clearTimeout(timer); };
  }, [requestName, retry, translate]);

  const save = async () => {
    if (!draft.name.trim() || !draft.slug || translating || saving) return;
    setSaving(true);
    const row = { name: draft.name.trim(), name_ar: draft.name_ar?.trim() || null, slug: draft.slug, icon: draft.icon || null, description: draft.description || null, sort: draft.sort ?? 100 };
    try {
      const { error } = draft.id ? await supabase.from("categories").update(row).eq("id", draft.id) : await supabase.from("categories").insert(row);
      if (error) throw error;
      toast.success("Category saved"); onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save category"); }
    finally { setSaving(false); }
  };
  return <>
    <div className="grid gap-3">
      <div><Label htmlFor="category-name">Name (English)</Label><Input id="category-name" maxLength={120} value={draft.name} onChange={(e) => {
        const name = e.target.value;
        revision.current += 1;
        setDraft({ ...draft, name, name_ar: "", slug: slugify(name) });
        setRequestName(name); setTranslating(Boolean(name.trim()));
      }} /></div>
      <div><Label htmlFor="category-arabic">Name (Arabic)</Label><div className="flex items-center gap-2">
        <Input id="category-arabic" dir="rtl" value={draft.name_ar ?? ""} onChange={(e) => { revision.current += 1; setTranslating(false); setDraft({ ...draft, name_ar: e.target.value }); }} />
        {translating ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Translating" /> : <Button variant="ghost" size="icon" title="Translate to Arabic" aria-label="Translate to Arabic" disabled={!draft.name.trim()} onClick={() => { revision.current += 1; setRequestName(draft.name); setRetry((v) => v + 1); setTranslating(true); }}><RotateCw className="size-4" /></Button>}
      </div></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label htmlFor="category-slug">Slug</Label><Input id="category-slug" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })} /></div>
        <div><Label htmlFor="category-sort">Sort</Label><Input id="category-sort" type="number" value={draft.sort ?? 100} onChange={(e) => setDraft({ ...draft, sort: Number(e.target.value) })} /></div>
      </div>
      <div><Label htmlFor="category-icon">Icon (emoji)</Label><Input id="category-icon" value={draft.icon ?? ""} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} /></div>
      <div><Label htmlFor="category-description">Description</Label><Textarea id="category-description" value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
    </div>
    <DialogFooter><Button disabled={saving || translating || !draft.name.trim() || !draft.slug} onClick={save}>{saving && <Loader2 className="size-4 animate-spin" />}Save</Button></DialogFooter>
  </>;
}