import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { slugify } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Obj = Record<string, unknown>;
function useSetting(key: string) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["setting", key], queryFn: async () => ((await supabase.from("site_settings").select("value").eq("key", key).maybeSingle()).data?.value ?? {}) as Obj });
  const save = async (value: Obj) => {
    const { error } = await supabase.from("site_settings").upsert({ key, value: value as Json, updated_at: new Date().toISOString() });
    if (error) { toast.error(error.message); return; }
    toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["setting", key] });
  };
  return { value: q.data, save };
}
function useDraft(key: string) {
  const { value, save } = useSetting(key);
  const [d, setD] = useState<Obj>({});
  useEffect(() => { if (value) setD(value); }, [value]);
  const s = (k: string) => (d[k] as string | undefined) ?? "";
  const set = (k: string, v: unknown) => setD({ ...d, [k]: v });
  return { d, s, set, save: () => save(d) };
}
const F = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1"><Label>{label}</Label>{children}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
);
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <div className="rounded-xl border bg-card p-5 space-y-4 max-w-3xl"><h3 className="font-semibold">{title}</h3>{children}</div>;

export function AdminSettings() {
  return (
    <Tabs defaultValue="general">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="pages">Pages</TabsTrigger>
        <TabsTrigger value="menu">Menu</TabsTrigger>
        <TabsTrigger value="locale">Language & currency</TabsTrigger>
        <TabsTrigger value="ai">AI agent</TabsTrigger>
        <TabsTrigger value="payments">Payments</TabsTrigger>
        <TabsTrigger value="invoice">Invoice</TabsTrigger>
      </TabsList>
      <div className="mt-4">
        <TabsContent value="general"><General /></TabsContent>
        <TabsContent value="pages"><Pages /></TabsContent>
        <TabsContent value="menu"><Menu /></TabsContent>
        <TabsContent value="locale"><Locale /></TabsContent>
        <TabsContent value="ai"><Secrets title="AI agent" fields={[["openai_api_key", "OpenAI API key (optional)", "Leave empty to keep using the built-in AI included with the platform."], ["ai_model", "Model name", "e.g. gpt-5-mini"]]} /></TabsContent>
        <TabsContent value="payments"><Payments /></TabsContent>
        <TabsContent value="invoice"><Invoice /></TabsContent>
      </div>
    </Tabs>
  );
}

function General() {
  const { s, set, save } = useDraft("general");
  return (
    <Card title="Website">
      <F label="Website title"><Input value={s("site_title")} onChange={(e) => set("site_title", e.target.value)} /></F>
      <F label="Tagline / SEO description"><Textarea value={s("tagline")} onChange={(e) => set("tagline", e.target.value)} /></F>
      <F label="Support email"><Input value={s("support_email")} onChange={(e) => set("support_email", e.target.value)} /></F>
      <F label="Support WhatsApp"><Input value={s("support_phone")} onChange={(e) => set("support_phone", e.target.value)} /></F>
      <Button onClick={save}>Save</Button>
    </Card>
  );
}

function Locale() {
  const { d, s, set, save } = useDraft("general");
  const langs = (d["languages"] as string[] | undefined) ?? ["en"];
  const toggle = (l: string) => set("languages", langs.includes(l) ? langs.filter((x) => x !== l) : [...langs, l]);
  return (
    <Card title="Language & currency">
      <F label="Default language">
        <Select value={s("default_language") || "en"} onValueChange={(v) => set("default_language", v)}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="ar">العربية</SelectItem></SelectContent></Select>
      </F>
      <div className="space-y-2"><Label>Enabled languages</Label>
        {([["en", "English"], ["ar", "Arabic (RTL)"]] as const).map(([k, n]) => <div key={k} className="flex items-center gap-2"><Switch checked={langs.includes(k)} onCheckedChange={() => toggle(k)} /><span className="text-sm">{n}</span></div>)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <F label="Currency">
          <Select value={s("currency") || "AED"} onValueChange={(v) => set("currency", v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["AED", "USD", "EUR", "SAR", "GBP"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        </F>
        <F label="VAT %"><Input type="number" value={String(d["vat_pct"] ?? 5)} onChange={(e) => set("vat_pct", Number(e.target.value))} /></F>
      </div>
      <p className="text-xs text-muted-foreground">Prices and VAT on bookings currently stay in AED with 5% UAE VAT; these values are saved for the upcoming multi-currency rollout.</p>
      <Button onClick={save}>Save</Button>
    </Card>
  );
}

function Menu() {
  const { d, set, save } = useDraft("menu");
  const items = (d["items"] as { label: string; href: string }[] | undefined) ?? [];
  const upd = (next: typeof items) => set("items", next);
  return (
    <Card title="Header menu">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <Input placeholder="Label" value={it.label} onChange={(e) => upd(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <Input placeholder="/link" value={it.href} onChange={(e) => upd(items.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} />
          <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => { const n = [...items]; const a = n[i - 1]!; n[i - 1] = n[i]!; n[i] = a; upd(n); }}>↑</Button>
          <Button variant="ghost" size="sm" onClick={() => upd(items.filter((_, j) => j !== i))}>✕</Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => upd([...items, { label: "", href: "/" }])}>+ Add menu item</Button>
        <Button onClick={save}>Save</Button>
      </div>
    </Card>
  );
}

type Page = { id?: string; slug: string; title: string; body: string; published: boolean; in_menu: boolean; sort: number };
function Pages() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-pages"], queryFn: async () => (await supabase.from("site_pages").select("*").order("sort")).data ?? [] });
  const [edit, setEdit] = useState<Page | null>(null);
  const save = async () => {
    if (!edit?.title.trim()) return;
    const row = { ...edit, slug: edit.slug || slugify(edit.title), updated_at: new Date().toISOString() };
    const { error } = edit.id ? await supabase.from("site_pages").update(row).eq("id", edit.id) : await supabase.from("site_pages").insert(row);
    if (error) { toast.error(error.message); return; }
    toast.success("Page saved"); setEdit(null); qc.invalidateQueries({ queryKey: ["admin-pages"] });
  };
  const del = async (id: string) => {
    if (!confirm("Delete this page?")) return;
    await supabase.from("site_pages").delete().eq("id", id); qc.invalidateQueries({ queryKey: ["admin-pages"] });
  };
  if (edit) return (
    <Card title={edit.id ? "Edit page" : "New page"}>
      <div className="grid grid-cols-2 gap-3">
        <F label="Title"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></F>
        <F label="URL slug" hint={`/p/${edit.slug || slugify(edit.title)}`}><Input value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: slugify(e.target.value) })} /></F>
      </div>
      <F label="Content" hint="Plain text; blank lines become paragraphs."><Textarea rows={12} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></F>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm"><Switch checked={edit.published} onCheckedChange={(v) => setEdit({ ...edit, published: v })} />Published</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={edit.in_menu} onCheckedChange={(v) => setEdit({ ...edit, in_menu: v })} />Show in footer</label>
      </div>
      <div className="flex gap-2"><Button onClick={save}>Save page</Button><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
    </Card>
  );
  return (
    <Card title="Website pages">
      {data?.length === 0 && <p className="text-sm text-muted-foreground">No pages yet — add Terms, Privacy, About, FAQ…</p>}
      <div className="divide-y">
        {data?.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-2">
            <div><span className="font-medium">{p.title}</span> <span className="text-sm text-muted-foreground">/p/{p.slug}</span> {!p.published && <span className="text-xs text-muted-foreground">(draft)</span>}</div>
            <div className="space-x-1">
              {p.published && <Button asChild size="sm" variant="ghost"><a href={`/p/${p.slug}`} target="_blank" rel="noreferrer">View</a></Button>}
              <Button size="sm" variant="outline" onClick={() => setEdit(p)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => del(p.id)}>Delete</Button>
            </div>
          </div>
        ))}
      </div>
      <Button onClick={() => setEdit({ slug: "", title: "", body: "", published: true, in_menu: true, sort: 100 })}>+ Add page</Button>
    </Card>
  );
}

function Secrets({ title, fields }: { title: string; fields: [string, string, string][] }) {
  const qc = useQueryClient();
  const keys = fields.map((f) => f[0]);
  const { data } = useQuery({ queryKey: ["admin-secrets", keys], queryFn: async () => (await supabase.from("admin_secrets").select("key, value").in("key", keys)).data ?? [] });
  const [vals, setVals] = useState<Record<string, string>>({});
  const stored = (k: string) => data?.find((r) => r.key === k)?.value ?? "";
  const mask = (v: string) => (v.length > 8 ? `${v.slice(0, 4)}••••${v.slice(-4)}` : v ? "••••" : "not set");
  const save = async () => {
    const rows = Object.entries(vals).filter(([, v]) => v !== "").map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
    if (!rows.length) return;
    const { error } = await supabase.from("admin_secrets").upsert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); setVals({}); qc.invalidateQueries({ queryKey: ["admin-secrets"] });
  };
  return (
    <Card title={title}>
      {fields.map(([k, label, hint]) => (
        <F key={k} label={label} hint={`${hint} Current: ${mask(stored(k))}`}>
          <Input type={k.includes("key") || k.includes("secret") ? "password" : "text"} autoComplete="off" placeholder="Enter new value to replace" value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
        </F>
      ))}
      <p className="text-xs text-muted-foreground">Only admins can read these values.</p>
      <Button onClick={save}>Save</Button>
    </Card>
  );
}

function Payments() {
  const { s, set, save } = useDraft("payments");
  return (
    <div className="space-y-4">
      <Card title="Payment mode">
        <F label="Provider" hint="Demo keeps payments simulated. Live Stripe checkout requires connecting Stripe.">
          <Select value={s("provider") || "demo"} onValueChange={(v) => set("provider", v)}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="demo">Demo (no real money)</SelectItem><SelectItem value="stripe">Stripe</SelectItem></SelectContent></Select>
        </F>
        <F label="Stripe mode">
          <Select value={s("stripe_mode") || "test"} onValueChange={(v) => set("stripe_mode", v)}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="test">Test</SelectItem><SelectItem value="live">Live</SelectItem></SelectContent></Select>
        </F>
        <Button onClick={save}>Save</Button>
      </Card>
      <Secrets title="Stripe keys" fields={[["stripe_publishable_key", "Publishable key", "Starts with pk_."], ["stripe_secret_key", "Secret key", "Starts with sk_."], ["stripe_webhook_secret", "Webhook signing secret", "Starts with whsec_."]]} />
    </div>
  );
}

function Invoice() {
  const { s, set, save } = useDraft("invoice");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Invoice settings">
        <F label="Legal company name"><Input value={s("legal_name")} onChange={(e) => set("legal_name", e.target.value)} /></F>
        <F label="Platform TRN (UAE VAT)"><Input value={s("trn")} onChange={(e) => set("trn", e.target.value)} /></F>
        <F label="Address"><Textarea value={s("address")} onChange={(e) => set("address", e.target.value)} /></F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Invoice prefix"><Input value={s("prefix")} onChange={(e) => set("prefix", e.target.value.toUpperCase())} /></F>
          <F label="Accent colour"><Input type="color" value={s("accent") || "#b8860b"} onChange={(e) => set("accent", e.target.value)} /></F>
        </div>
        <F label="Logo URL"><Input value={s("logo_url")} onChange={(e) => set("logo_url", e.target.value)} /></F>
        <F label="Footer / payment terms"><Textarea value={s("footer")} onChange={(e) => set("footer", e.target.value)} /></F>
        <Button onClick={save}>Save</Button>
      </Card>
      <div className="rounded-xl border bg-background p-6 text-sm shadow-sm h-fit">
        <div className="flex items-start justify-between border-b-4 pb-3" style={{ borderColor: s("accent") || "#b8860b" }}>
          <div>{s("logo_url") ? <img src={s("logo_url")} alt="" className="h-8" /> : <div className="text-lg font-bold">{s("legal_name") || "Company"}</div>}<div className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{s("address")}</div></div>
          <div className="text-end"><div className="font-semibold">TAX INVOICE</div><div className="text-xs">{s("prefix") || "DM"}-2026-000123</div>{s("trn") && <div className="text-xs">TRN {s("trn")}</div>}</div>
        </div>
        <div className="py-3 space-y-1"><div className="flex justify-between"><span>Performance — 2 hours</span><span>AED 5,000.00</span></div><div className="flex justify-between text-muted-foreground"><span>VAT 5%</span><span>AED 250.00</span></div><div className="flex justify-between border-t pt-1 font-semibold"><span>Total</span><span>AED 5,250.00</span></div></div>
        <p className="text-xs text-muted-foreground border-t pt-2">{s("footer")}</p>
      </div>
    </div>
  );
}
