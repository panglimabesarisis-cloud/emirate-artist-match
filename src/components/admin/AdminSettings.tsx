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
import { WhatsAppSettings } from "./WhatsAppSettings";
import { ARTIST_MENU, DEFAULT_MENU, TALENT_MENU, parseSiteSettings } from "@/lib/site-settings";
import { InvoicePaper, type PaperData } from "@/components/dashboard/InvoicePaper";
import { Printer } from "lucide-react";
import { A4Dialog } from "./documents/A4Dialog";
import "./admin-settings.css";
import { GoogleBackupTest } from "./GoogleBackupTest";
import { StripeConnectionCheck } from "./StripeConnectionCheck";

type Obj = Record<string, unknown>;
function useSetting(key: string) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["setting", key], queryFn: async () => ((await supabase.from("site_settings").select("value").eq("key", key).maybeSingle()).data?.value ?? {}) as Obj });
  const save = async (value: Obj) => {
    const { error } = await supabase.from("site_settings").upsert({ key, value: value as Json, updated_at: new Date().toISOString() });
    if (error) { toast.error(error.message); return; }
    toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["setting", key] }); qc.invalidateQueries({ queryKey: ["site-settings"] });
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
const Card = ({ title, description, wide, children }: { title: string; description?: string; wide?: boolean; children: React.ReactNode }) => (
  <section className={`adm-set-card${wide ? " is-wide" : ""}`}><header><h2>{title}</h2>{description && <p>{description}</p>}</header>{children}</section>
);
const Actions = ({ children }: { children: React.ReactNode }) => <div className="adm-set-actions">{children}</div>;

export function AdminSettings() {
  return (
    <Tabs defaultValue="general" className="adm-settings">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="pages">Pages</TabsTrigger>
        <TabsTrigger value="menu">Menu</TabsTrigger>
        <TabsTrigger value="locale">Language & currency</TabsTrigger>
        <TabsTrigger value="ai">AI agent</TabsTrigger>
        <TabsTrigger value="payments">Payments</TabsTrigger>
        <TabsTrigger value="invoice">Invoice</TabsTrigger>
        <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
      </TabsList>
      <div className="mt-4">
        <TabsContent value="general"><General /></TabsContent>
        <TabsContent value="pages"><Pages /></TabsContent>
        <TabsContent value="menu"><Menu /></TabsContent>
        <TabsContent value="locale"><Locale /></TabsContent>
        <TabsContent value="ai"><div className="adm-set-grid"><Secrets title="AI backup (Google Gemini)" fields={[["google_api_key", "Google Gemini API key", "Used only when the built-in AI refuses, for example when its credits run out. Chat text is then sent to Google and billed to this key."], ["google_model", "Gemini model", "Leave empty for gemini-3.8-flash."]]} /><GoogleBackupTest /></div></TabsContent>
        <TabsContent value="payments"><Payments /></TabsContent>
        <TabsContent value="invoice"><Invoice /></TabsContent>
        <TabsContent value="whatsapp"><WhatsAppSettings /></TabsContent>
      </div>
    </Tabs>
  );
}

function General() {
  const { s, set, save } = useDraft("general");
  return (
    <div className="adm-set-grid">
      <Card wide title="Website identity" description="Used for the home page title and description, the footer and the Support page.">
        <div className="adm-set-fields">
          <F label="Website title"><Input value={s("site_title")} onChange={(e) => set("site_title", e.target.value)} /></F>
          <F label="Support email"><Input value={s("support_email")} onChange={(e) => set("support_email", e.target.value)} /></F>
          <F label="Support WhatsApp"><Input value={s("support_phone")} onChange={(e) => set("support_phone", e.target.value)} /></F>
          <div className="is-full"><F label="Tagline / SEO description"><Textarea value={s("tagline")} onChange={(e) => set("tagline", e.target.value)} /></F></div>
        </div>
        <Actions><Button onClick={save}>Save general settings</Button></Actions>
      </Card>
    </div>
  );
}

function Locale() {
  const { d, s, set, save } = useDraft("general");
  const langs = (d["languages"] as string[] | undefined) ?? ["en"];
  const toggle = (l: string) => set("languages", langs.includes(l) ? langs.filter((x) => x !== l) : [...langs, l]);
  return (
    <div className="adm-set-grid">
      <Card title="Language" description="The default language and the languages visitors can choose.">
        <F label="Default language">
          <Select value={s("default_language") || "en"} onValueChange={(v) => set("default_language", v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="ar">العربية</SelectItem></SelectContent></Select>
        </F>
        <div className="space-y-2"><Label>Enabled languages</Label>
          {([["en", "English"], ["ar", "Arabic (RTL)"]] as const).map(([k, n]) => <div key={k} className="flex items-center gap-2"><Switch checked={langs.includes(k)} onCheckedChange={() => toggle(k)} aria-label={n} /><span className="text-sm">{n}</span></div>)}
        </div>
        <Actions><Button onClick={save}>Save language settings</Button></Actions>
      </Card>
      <Card title="Currency" description="Prices and VAT on bookings currently stay in AED with 5% UAE VAT; these values are saved for the upcoming multi-currency rollout.">
        <div className="adm-set-fields">
          <F label="Currency">
            <Select value={s("currency") || "AED"} onValueChange={(v) => set("currency", v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["AED", "USD", "EUR", "SAR", "GBP"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
          </F>
          <F label="VAT %"><Input type="number" value={String(d["vat_pct"] ?? 5)} onChange={(e) => set("vat_pct", Number(e.target.value))} /></F>
        </div>
        <Actions><Button onClick={save}>Save currency settings</Button></Actions>
      </Card>
    </div>
  );
}

function Menu() {
  const { d, set, save } = useDraft("menu");
  const items = (d["items"] as { label: string; href: string }[] | undefined) ?? DEFAULT_MENU;
  const upd = (next: typeof items) => set("items", next);
  return (
    <div className="adm-set-grid">
      <Card wide title="Header menu" description={`These links are the website header, in this order. ${TALENT_MENU} opens the talent categories and ${ARTIST_MENU} opens the artist menu. Other links start with / or https://. Sign in, Join and Send Job always stay.`}>
        <div className="admin-table-wrap"><table><thead><tr><th>Order</th><th>Menu label</th><th>Link</th><th>Actions</th></tr></thead><tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td>#{i + 1}</td>
              <td><Input aria-label={`Label of menu item ${i + 1}`} placeholder="Label" value={it.label} onChange={(e) => upd(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></td>
              <td><Input aria-label={`Link of menu item ${i + 1}`} placeholder="/link" value={it.href} onChange={(e) => upd(items.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} /></td>
              <td><div className="adm-actions"><Button variant="outline" size="sm" aria-label={`Move menu item ${i + 1} up`} disabled={i === 0} onClick={() => { const n = [...items]; const a = n[i - 1]!; n[i - 1] = n[i]!; n[i] = a; upd(n); }}>↑</Button><Button variant="ghost" size="sm" aria-label={`Remove menu item ${i + 1}`} onClick={() => upd(items.filter((_, j) => j !== i))}>✕</Button></div></td>
            </tr>
          ))}
        </tbody></table></div>
        <Actions><Button variant="outline" onClick={() => upd([...items, { label: "", href: "/" }])}>+ Add menu item</Button><Button onClick={save}>Save menu</Button></Actions>
      </Card>
    </div>
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
    <div className="adm-set-grid"><Card wide title={edit.id ? "Edit page" : "New page"} description="Plain-text pages published under /p/.">
      <div className="adm-set-fields">
        <F label="Title"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></F>
        <F label="URL slug" hint={`/p/${edit.slug || slugify(edit.title)}`}><Input value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: slugify(e.target.value) })} /></F>
      </div>
      <F label="Content" hint="Plain text; blank lines become paragraphs."><Textarea rows={12} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></F>
      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm"><Switch checked={edit.published} onCheckedChange={(v) => setEdit({ ...edit, published: v })} />Published</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={edit.in_menu} onCheckedChange={(v) => setEdit({ ...edit, in_menu: v })} />Show in footer</label>
      </div>
      <Actions><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}>Save page</Button></Actions>
    </Card></div>
  );
  return (
    <div className="adm-set-grid"><Card wide title="Website pages" description="Terms, privacy, FAQ and other pages of the website.">
      <div className="admin-table-wrap"><table><thead><tr><th>Address</th><th>Title</th><th>Status</th><th>Footer</th><th>Actions</th></tr></thead><tbody>
        {data?.length === 0 && <tr><td colSpan={5}>No pages yet. Add Terms, Privacy, About or FAQ.</td></tr>}
        {data?.map((p) => (
          <tr key={p.id}>
            <td><b>/p/{p.slug}</b></td><td>{p.title}</td><td><span className={`adm-pill is-${p.published ? "paid" : "expired"}`}>{p.published ? "published" : "draft"}</span></td><td>{p.in_menu ? "Shown" : "—"}</td>
            <td><div className="adm-actions">
              {p.published && <Button asChild size="sm" variant="ghost"><a href={`/p/${p.slug}`} target="_blank" rel="noreferrer">View</a></Button>}
              <Button size="sm" variant="outline" onClick={() => setEdit(p)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => del(p.id)}>Delete</Button>
            </div></td>
          </tr>
        ))}
      </tbody></table></div>
      <Actions><Button onClick={() => setEdit({ slug: "", title: "", body: "", published: true, in_menu: true, sort: 100 })}>+ Add page</Button></Actions>
    </Card></div>
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
    <Card title={title} description="Only admins can read these values.">
      {fields.map(([k, label, hint]) => (
        <F key={k} label={label} hint={`${hint} Current: ${mask(stored(k))}`}>
          <Input type={k.includes("key") || k.includes("secret") ? "password" : "text"} autoComplete="off" placeholder="Enter new value to replace" value={vals[k] ?? ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
        </F>
      ))}
      <Actions><Button onClick={save}>Save keys</Button></Actions>
    </Card>
  );
}

function Payments() {
  const { s, set, save } = useDraft("payments");
  return (
    <div className="adm-set-grid">
      <StripeConnectionCheck />
      <Card title="Payment mode" description="Demo keeps payments simulated. Live Stripe checkout requires connecting Stripe.">
        <F label="Provider">
          <Select value={s("provider") || "demo"} onValueChange={(v) => set("provider", v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="demo">Demo (no real money)</SelectItem><SelectItem value="stripe">Stripe</SelectItem></SelectContent></Select>
        </F>
        <F label="Saved Stripe mode preference">
          <Select value={s("stripe_mode") || "test"} onValueChange={(v) => set("stripe_mode", v)}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="test">Test</SelectItem><SelectItem value="live">Live</SelectItem></SelectContent></Select>
        </F>
        <Actions><Button onClick={save}>Save payment mode</Button></Actions>
      </Card>
      <Secrets title="Stripe keys" fields={[["stripe_publishable_key", "Publishable key", "Starts with pk_."], ["stripe_secret_key", "Secret key", "Starts with sk_."], ["stripe_webhook_secret", "Webhook signing secret", "Starts with whsec_."]]} />
    </div>
  );
}

const SAMPLE: Omit<PaperData, "number"> = {
  artistName: "Sample artist", client: "Sample client", clientEmail: "client@example.com", issued: "2026-01-15", due: "2026-02-01",
  items: [{ title: "Performance, 2 hours", qty: 1, price: 5000 }], subtotal: 5000, vat: 250, total: 5250, status: "unpaid", notes: null,
};

function Invoice() {
  const { d, s, set, save } = useDraft("invoice");
  const [full, setFull] = useState(false);
  const issuer = parseSiteSettings([{ key: "invoice", value: d }]).invoice;
  const paper: PaperData = { ...SAMPLE, number: `${s("prefix") || "DM"}-2026-000123` };
  return (
    <div className="adm-set-invoice">
      <div className="min-w-0">
        <p className="adm-meta mb-3">Live A4 preview with sample figures</p>
        <InvoicePaper data={paper} issuer={issuer} tall />
      </div>
      <Card title="Invoice settings" description="The preview changes as you type. Save to use these details on every invoice.">
        <F label="Legal company name"><Input value={s("legal_name")} onChange={(e) => set("legal_name", e.target.value)} /></F>
        <F label="Platform TRN (UAE VAT)"><Input value={s("trn")} onChange={(e) => set("trn", e.target.value)} /></F>
        <F label="Address"><Textarea value={s("address")} onChange={(e) => set("address", e.target.value)} /></F>
        <div className="adm-set-fields">
          <F label="Invoice prefix"><Input value={s("prefix")} onChange={(e) => set("prefix", e.target.value.toUpperCase())} /></F>
          <F label="Accent colour"><Input type="color" value={s("accent") || "#b8860b"} onChange={(e) => set("accent", e.target.value)} /></F>
        </div>
        <F label="Logo URL" hint="Must start with https://"><Input value={s("logo_url")} onChange={(e) => set("logo_url", e.target.value)} /></F>
        <F label="Footer / payment terms"><Textarea value={s("footer")} onChange={(e) => set("footer", e.target.value)} /></F>
        <Actions><Button variant="outline" onClick={() => setFull(true)}><Printer />Preview and print A4</Button><Button onClick={save}>Save invoice settings</Button></Actions>
      </Card>
      {full && <A4Dialog title="Sample invoice" onClose={() => setFull(false)}><InvoicePaper data={paper} issuer={issuer} tall /></A4Dialog>}
    </div>
  );
}
