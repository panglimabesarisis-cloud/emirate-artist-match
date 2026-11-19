import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { slugify } from "@/lib/format";
import { specialtyLimit } from "@/lib/join-rules";
import { X } from "lucide-react";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "Talent register | Dealmaker" },
      { name: "description", content: "Join Dealmaker as talent in 5 quick steps and get booked across the UAE." },
      { property: "og:title", content: "Talent register | Dealmaker" },
      { property: "og:description", content: "Register as talent: category, photos, rate card, stage identity and contract." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JoinPage,
});

const STEPS = ["Plan", "Account", "Category & photos", "Rate card", "Stage identity", "Contract"];
type Pkg = { title: string; description: string; duration: string; price: string };

function GoogleG() {
  return (<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>);
}

function JoinPage() {
  const [user, setUser] = useState<{ id: string; email: string; name: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [step, setStep] = useState(0);
  const [plan, setPlanState] = useState<string | null>(null);
  useEffect(() => { setPlanState(localStorage.getItem("join_plan")); }, []);
  const setPlan = (p: string | null) => { if (p) localStorage.setItem("join_plan", p); else localStorage.removeItem("join_plan"); setPlanState(p); };
  const shown = plan ? step + 1 : 0;

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (u) {
        await supabase.rpc("become_artist");
        const m = u.user_metadata ?? {};
        setUser({ id: u.id, email: u.email ?? "", name: m["display_name"] ?? m["full_name"] ?? m["name"] ?? "" });
        const { data: a } = await supabase.from("artists").select("id").eq("user_id", u.id).maybeSingle();
        setHasProfile(!!a);
      }
      setChecked(true);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((e) => { if (e === "SIGNED_IN") setTimeout(load, 0); });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-semibold">Talent register</h1>
        <p className="mt-1 text-muted-foreground">Choose a plan, then five quick steps. Our team reviews every profile before it goes live.</p>
        <ol className="mt-8 grid grid-cols-6 gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="text-center">
              <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${i < shown ? "bg-gold text-gold-foreground border-gold" : i === shown ? "border-gold text-gold" : "text-muted-foreground"}`}>
                {i < shown ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <div className={`mt-2 hidden text-xs sm:block ${i === shown ? "font-medium" : "text-muted-foreground"}`}>{s}</div>
            </li>
          ))}
        </ol>
        <div className="mt-8 rounded-2xl border bg-card p-6">
          {!checked ? <p className="text-muted-foreground">Loading…</p>
            : hasProfile ? <div><p>Your talent profile is already submitted.</p><Button asChild className="mt-4"><Link to="/dashboard">Go to dashboard</Link></Button></div>
            : !plan ? <PlanStep onPick={setPlan} />
            : !user ? <AccountStep plan={plan} onChangePlan={() => setPlan(null)} />
            : <Wizard user={user} plan={plan} step={step} setStep={setStep} onChangePlan={() => setPlan(null)} />}
        </div>
      </div>
    </PublicLayout>
  );
}

function PlanStep({ onPick }: { onPick: (p: string) => void }) {
  const tiers = useQuery({ queryKey: ["join-plans"], queryFn: async () => (await supabase.from("plan_tiers").select("*").order("sort")).data ?? [] }).data;
  return (
    <div>
      <h2 className="text-xl font-semibold">Choose your plan</h2>
      <p className="text-sm text-muted-foreground">Your plan sets how many specialties, photos and AI replies you get. You can change it later.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {tiers?.map((t) => (
          <div key={t.code} className={`flex flex-col rounded-xl border p-4 ${t.code === "medium" ? "border-gold" : ""}`}>
            <div className="font-semibold">{t.name}</div>
            <div className="mt-1 text-2xl font-semibold">AED {Number(t.price_monthly).toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
            <ul className="mt-3 flex-1 space-y-1 text-sm text-muted-foreground">
              <li>{specialtyLimit(t.code)} {specialtyLimit(t.code) === 1 ? "specialty" : "specialties"}</li>
              <li>{t.ai_credits} AI credits</li>
              <li>{t.max_photos} photos · {t.max_videos} videos</li>
              <li>{Number(t.commission_pct)}% platform commission</li>
              {(Array.isArray(t.features) ? t.features as string[] : []).map((f) => <li key={f}>{f}</li>)}
            </ul>
            <Button type="button" onClick={() => onPick(t.code)} className="mt-4 bg-gradient-gold text-gold-foreground">Choose {t.name}</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanBadge({ plan, onChange }: { plan: string; onChange: () => void }) {
  return <p className="mb-4 text-sm text-muted-foreground">Plan: <b className="capitalize text-foreground">{plan}</b> · <button type="button" onClick={onChange} className="underline">change</button></p>;
}

function AccountStep({ plan, onChangePlan }: { plan: string; onChangePlan: () => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false);
  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/join" });
    if (r.error) toast.error("Sign-in failed. Please try again.");
  };
  const signup = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/join", data: { display_name: name, account_type: "artist" } } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Check your email to confirm, then continue the registration.");
  };
  return (
    <div>
      <PlanBadge plan={plan} onChange={onChangePlan} />
      <h2 className="text-xl font-semibold">Step 1 · Account</h2>
      <p className="text-sm text-muted-foreground">Sign up with Google and your name and email fill in automatically.</p>
      <Button type="button" variant="outline" onClick={google} className="mt-4 h-11 w-full"><GoogleG /> Sign up with Google</Button>
      <div className="my-5 text-center text-xs text-muted-foreground">or with email</div>
      <form onSubmit={signup} className="space-y-3">
        <div><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></div>
        <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>
        <Button type="submit" disabled={busy} className="w-full bg-gradient-gold text-gold-foreground">{busy ? "Please wait…" : "Create talent account"}</Button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">Already registered? <Link to="/auth" search={{ redirect: "/join" }} className="underline">Sign in</Link></p>
    </div>
  );
}

function Wizard({ user, plan, step, setStep, onChangePlan }: { user: { id: string; email: string; name: string }; plan: string; step: number; setStep: (n: number) => void; onChangePlan: () => void }) {
  const navigate = useNavigate();
  const limit = specialtyLimit(plan);
  const cat = useQuery({
    queryKey: ["join-catalog"],
    queryFn: async () => {
      const [c, s, e, a] = await Promise.all([
        supabase.from("categories").select("id,name").order("sort"),
        supabase.from("subcategories").select("id,name,category_id").order("name"),
        supabase.from("emirates").select("id,name").order("sort"),
        supabase.from("areas").select("id,name,emirate_id").order("name"),
      ]);
      return { categories: c.data ?? [], subcategories: s.data ?? [], emirates: e.data ?? [], areas: a.data ?? [] };
    },
  }).data;
  const [name, setName] = useState(user.name); const [phone, setPhone] = useState("");
  const [categoryId, setCategoryId] = useState(""); const [specs, setSpecs] = useState<string[]>([]); const [q, setQ] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [basePrice, setBasePrice] = useState("");
  const [pkgs, setPkgs] = useState<Pkg[]>([{ title: "Essential", description: "", duration: "60", price: "" }]);
  const [stage, setStage] = useState(""); const [tagline, setTagline] = useState(""); const [bio, setBio] = useState("");
  const [emirateId, setEmirateId] = useState(""); const [areaId, setAreaId] = useState("");
  const [languages, setLanguages] = useState("English"); const [radius, setRadius] = useState("30");
  const [trn, setTrn] = useState(""); const [agree, setAgree] = useState(false); const [busy, setBusy] = useState(false);
  const previews = photos.map((f) => URL.createObjectURL(f));

  const validate = (): string | null => {
    if (step === 0 && (!name.trim() || !/^\+?[0-9 ]{8,16}$/.test(phone))) return "Enter your name and a valid WhatsApp number.";
    if (step === 1 && !categoryId) return "Choose your talent category.";
    if (step === 1 && specs.length > limit) return `Your plan allows up to ${limit} specialties.`;
    if (step === 1 && photos.length !== 5) return "Upload exactly 5 photos.";
    if (step === 2 && (!Number(basePrice) || pkgs.some((p) => !p.title.trim() || !Number(p.price)))) return "Enter a starting price and a title and price for each package.";
    if (step === 3 && (!stage.trim() || !emirateId)) return "Enter your stage name and base emirate.";
    if (step === 4 && !agree) return "Please accept the partnership contract.";
    return null;
  };
  const next = () => { const e = validate(); if (e) { toast.error(e); return; } setStep(step + 1); window.scrollTo({ top: 0 }); };

  const addPhotos = (files: FileList | null) => {
    const imgs = Array.from(files ?? []).filter((f) => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024);
    setPhotos([...photos, ...imgs].slice(0, 5));
  };

  const submit = async () => {
    const e = validate(); if (e) { toast.error(e); return; }
    setBusy(true);
    try {
      const { data: a, error } = await supabase.from("artists").insert({
        user_id: user.id, stage_name: stage.trim(), tagline: tagline || null, bio: bio || null,
        category_id: categoryId, subcategory_id: specs[0] ?? null, specialty_ids: specs, emirate_id: emirateId, area_id: areaId || null,
        base_price: Number(basePrice), languages: languages.split(",").map((s) => s.trim()).filter(Boolean),
        travel_radius_km: Number(radius) || null, notify_phone: phone.replace(/\s/g, ""), trn: trn || null,
        contract_accepted_at: new Date().toISOString(),
        slug: `${slugify(stage)}-${Math.random().toString(36).slice(2, 6)}`, hue: Math.floor(Math.random() * 360),
      }).select("id").single();
      if (error || !a) throw new Error(error?.message ?? "Could not save profile");
      await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", user.id);
      await supabase.from("rate_cards").insert(pkgs.map((p, i) => ({ artist_id: a.id, title: p.title.trim(), description: p.description || null, duration_minutes: Number(p.duration) || null, price: Number(p.price), sort: i + 1 })));
      for (const [i, f] of photos.entries()) {
        const path = `${a.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
        const up = await supabase.storage.from("artist-media").upload(path, f, { contentType: f.type });
        if (!up.error) await supabase.from("artist_media").insert({ artist_id: a.id, kind: "photo", url: path, storage_path: path, sort: i + 1 });
      }
      toast.success("Profile saved — one last step: payment.");
      navigate({ to: "/join/payment" });
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  };

  const subs = cat?.subcategories.filter((s) => s.category_id === categoryId) ?? [];
  return (
    <div className="space-y-4">
      <PlanBadge plan={plan} onChange={onChangePlan} />
      {step === 0 && <>
        <h2 className="text-xl font-semibold">Step 1 · Account</h2>
        <div><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></div>
        <div><Label>Email</Label><Input value={user.email} disabled /></div>
        <div><Label>WhatsApp number</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+971 50 123 4567" /><p className="mt-1 text-xs text-muted-foreground">Booking approvals are sent here.</p></div>
      </>}
      {step === 1 && <>
        <h2 className="text-xl font-semibold">Step 2 · Talent category & photos</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Category</Label><Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setSpecs([]); }}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{cat?.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="relative">
            <Label>Specialties ({specs.length}/{limit})</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {specs.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs">{cat?.subcategories.find((s) => s.id === id)?.name}<button type="button" aria-label="Remove" onClick={() => setSpecs(specs.filter((x) => x !== id))}><X className="h-3 w-3" /></button></span>)}
            </div>
            <Input className="mt-1" value={q} onChange={(e) => setQ(e.target.value)} disabled={!categoryId || specs.length >= limit} placeholder={!categoryId ? "Choose a category first" : specs.length >= limit ? `Limit reached on ${plan} plan` : "Search specialty…"} />
            {q.trim() && specs.length < limit && (
              <div className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-md border bg-popover shadow">
                {subs.filter((s) => !specs.includes(s.id) && s.name.toLowerCase().includes(q.toLowerCase())).map((s) => (
                  <button type="button" key={s.id} onClick={() => { setSpecs([...specs, s.id]); setQ(""); }} className="block w-full px-3 py-2 text-start text-sm hover:bg-accent">{s.name}</button>
                ))}
                {!subs.some((s) => !specs.includes(s.id) && s.name.toLowerCase().includes(q.toLowerCase())) && <div className="px-3 py-2 text-sm text-muted-foreground">No match</div>}
              </div>
            )}
          </div>
        </div>
        <div>
          <Label>5 portfolio photos ({photos.length}/5)</Label>
          <p className="text-xs text-muted-foreground">The first photo becomes your cover. Max 10 MB each.</p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {previews.map((src, i) => (
              <div key={src} className="relative aspect-square overflow-hidden rounded-lg border">
                <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute end-1 top-1 rounded-full bg-background/90 p-1"><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
            {photos.length < 5 && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-accent">
                <Plus className="h-5 w-5" /> Add
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
        </div>
      </>}
      {step === 2 && <>
        <h2 className="text-xl font-semibold">Step 3 · Rate card</h2>
        <div><Label>Starting price (AED)</Label><Input type="number" min={0} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} /></div>
        {pkgs.map((p, i) => (
          <div key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-4">
            <div className="sm:col-span-2"><Label>Package name</Label><Input value={p.title} onChange={(e) => setPkgs(pkgs.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} /></div>
            <div><Label>Minutes</Label><Input type="number" value={p.duration} onChange={(e) => setPkgs(pkgs.map((x, j) => j === i ? { ...x, duration: e.target.value } : x))} /></div>
            <div><Label>Price (AED)</Label><Input type="number" value={p.price} onChange={(e) => setPkgs(pkgs.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} /></div>
            <div className="sm:col-span-4 flex gap-2"><Input placeholder="Short description (optional)" value={p.description} onChange={(e) => setPkgs(pkgs.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
              {pkgs.length > 1 && <Button type="button" variant="ghost" size="icon" aria-label="Remove package" onClick={() => setPkgs(pkgs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}</div>
          </div>
        ))}
        {pkgs.length < 3 && <Button type="button" variant="outline" onClick={() => setPkgs([...pkgs, { title: "", description: "", duration: "60", price: "" }])}><Plus className="h-4 w-4" /> Add package</Button>}
      </>}
      {step === 3 && <>
        <h2 className="text-xl font-semibold">Step 4 · Stage identity</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Stage name</Label><Input value={stage} onChange={(e) => setStage(e.target.value)} maxLength={80} /></div>
          <div><Label>Tagline</Label><Input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={120} /></div>
          <div><Label>Base emirate</Label><Select value={emirateId} onValueChange={(v) => { setEmirateId(v); setAreaId(""); }}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{cat?.emirates.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Base area</Label><Select value={areaId} onValueChange={setAreaId}><SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger><SelectContent>{cat?.areas.filter((a) => a.emirate_id === emirateId).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Languages (comma separated)</Label><Input value={languages} onChange={(e) => setLanguages(e.target.value)} /></div>
          <div><Label>Travel radius (km)</Label><Input type="number" value={radius} onChange={(e) => setRadius(e.target.value)} /></div>
        </div>
        <div><Label>Bio</Label><Textarea rows={5} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} /></div>
      </>}
      {step === 4 && <>
        <h2 className="text-xl font-semibold">Step 5 · Partnership contract</h2>
        <div className="max-h-72 overflow-y-auto rounded-xl border bg-muted/40 p-4 text-sm leading-relaxed">
          <p className="font-semibold">Dealmaker Talent Partnership Agreement</p>
          <ol className="mt-2 list-decimal space-y-2 ps-5">
            <li><b>Escrow payments.</b> Clients pay Dealmaker before the event. Funds are released to you after the performance is completed.</li>
            <li><b>Commission & VAT.</b> Dealmaker deducts the platform commission of your plan. Prices are in AED and 5% UAE VAT applies where required.</li>
            <li><b>No off-platform contact.</b> You will not share phone numbers, emails or social handles with clients before a booking is confirmed.</li>
            <li><b>Cancellations.</b> If you cancel a confirmed booking, the client is refunded 100%. Client cancellations follow the tiered refund policy.</li>
            <li><b>Content.</b> You own the rights to the photos, videos and information you upload and allow Dealmaker to display them.</li>
            <li><b>Conduct.</b> You will arrive on time, perform the agreed package and follow venue rules.</li>
          </ol>
        </div>
        <div><Label>TRN — Tax Registration Number (optional)</Label><Input value={trn} onChange={(e) => setTrn(e.target.value)} maxLength={20} /></div>
        <label className="flex items-start gap-2 text-sm"><Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" /> I agree to the Dealmaker Talent Partnership Agreement and Terms of Service.</label>
      </>}
      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
        {step < 4 ? <Button type="button" onClick={next} className="bg-gradient-gold text-gold-foreground">Next</Button>
          : <Button type="button" disabled={busy} onClick={submit} className="bg-gradient-gold text-gold-foreground">{busy ? "Submitting…" : "Submit & continue to payment"}</Button>}
      </div>
    </div>
  );
}
