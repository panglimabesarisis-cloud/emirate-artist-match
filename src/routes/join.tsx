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
import { SceneBackground } from "@/components/shared/SceneBackground";
import { ReferenceTheme } from "@/components/shared/ReferenceTheme";
import { SampleTestimonials } from "@/components/site/SampleTestimonials";
import { SignupRatecards } from "@/components/shared/SignupRatecards";
import { rateDraft, ratePayload, restoreRateDraft, type RateDraft } from "@/lib/ratecard";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "Talent register | Dealmaker" },
      { name: "description", content: "Join Dealmaker with flexible service packages, pricing units and work rules, and get booked across the UAE." },
      { property: "og:title", content: "Talent register | Dealmaker" },
      { property: "og:description", content: "Register as talent: category, photos, rate card, stage identity and contract." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JoinPage,
});

const STEPS = ["Plan", "Account", "Category & photos", "Rate card", "Stage identity", "Contract"];

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
        const { data: a } = await supabase.from("artists").select("id,onboarding_complete").eq("user_id", u.id).maybeSingle();
        setHasProfile(!!a?.onboarding_complete);
      }
      setChecked(true);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((e) => { if (e === "SIGNED_IN") setTimeout(load, 0); });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <ReferenceTheme><PublicLayout>
      <section className="reference-join join-centered"><SceneBackground />
      <div className="reference-wrap reference-join-grid">
        <header className="reference-join-side"><span className="reference-eyebrow">For artists · Dealmaker</span>
        <h1 className="text-3xl font-semibold">Talent register</h1>
        <p className="mt-1 text-muted-foreground">Choose a plan, then five quick steps. Our team reviews every profile before it goes live.</p>
        <ol className="reference-stepper">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === shown ? "step" : undefined}>
              <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${i < shown ? "bg-gold text-gold-foreground border-gold" : i === shown ? "border-gold text-gold" : "text-muted-foreground"}`}>
                {i < shown ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <div className={`mt-2 hidden text-xs sm:block ${i === shown ? "font-medium" : "text-muted-foreground"}`}>{s}</div>
            </li>
          ))}
        </ol>
        </header>
        <div className={`reference-join-card${!plan && !hasProfile ? " reference-join-plans" : ""}${plan && user && step === 2 ? " reference-join-rates" : ""}`}>
          {!checked ? <p className="text-muted-foreground">Loading…</p>
            : hasProfile ? <div><p>Your talent profile is already submitted.</p><Button asChild className="mt-4"><Link to="/dashboard">Go to dashboard</Link></Button></div>
            : !plan ? <PlanStep onPick={setPlan} />
            : !user ? <AccountStep plan={plan} onChangePlan={() => setPlan(null)} />
            : <Wizard user={user} plan={plan} step={step} setStep={setStep} onChangePlan={() => setPlan(null)} />}
        </div>
      </div>
      <SampleTestimonials />
      </section>
    </PublicLayout></ReferenceTheme>
  );
}

function PlanStep({ onPick }: { onPick: (p: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const tiers = useQuery({ queryKey: ["join-plans"], queryFn: async () => (await supabase.from("plan_tiers").select("*").order("sort")).data ?? [] }).data;
  return (
    <div>
      <h2 className="text-xl font-semibold">Choose your plan</h2>
      <p className="text-sm text-muted-foreground">Your plan sets how many specialties, photos and AI replies you get. You can change it later.</p>
      <div className="reference-plans" role="radiogroup" aria-label="Choose your plan">
        {tiers?.map((t) => (
          <div key={t.code} role="radio" aria-checked={selected === t.code} tabIndex={0} onClick={() => setSelected(t.code)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(t.code); } }} className={`reference-plan ${selected === t.code ? "selected" : ""}`}>
            {t.code === "pro" && <span className="reference-best-value">Best value</span>}
            <div className="reference-plan-name">{t.name}</div>
            <div className="reference-plan-price">AED {Number(t.price_monthly).toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
            <ul className="mt-3 flex-1 space-y-1 text-sm text-muted-foreground">
              <li>{specialtyLimit(t.code)} {specialtyLimit(t.code) === 1 ? "specialty" : "specialties"}</li>
              <li>{t.ai_credits} AI credits</li>
              <li>{t.max_photos} photos · {t.max_videos} videos</li>
              <li>{Number(t.commission_pct)}% platform commission</li>
              {(Array.isArray(t.features) ? t.features as string[] : []).map((f) => <li key={f}>{f}</li>)}
            </ul>
            <Button type="button" variant="outline" onClick={() => setSelected(t.code)} className="mt-4">{selected === t.code ? "Selected" : `Choose ${t.name}`}</Button>
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-between"><Button variant="outline" disabled>Back</Button><Button className="reference-gold" disabled={!selected} onClick={() => { if (selected) onPick(selected); }}>Next</Button></div>
    </div>
  );
}

function PlanBadge({ plan, onChange }: { plan: string; onChange: () => void }) {
  return <p className="mb-4 text-sm text-muted-foreground">Plan: <b className="capitalize text-foreground">{plan}</b> · <button type="button" onClick={onChange} className="underline">change</button></p>;
}

function AccountStep({ plan, onChangePlan }: { plan: string; onChangePlan: () => void }) {
  const [valid, setValid] = useState(false);
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
      <form onSubmit={signup} onInput={e => setValid(e.currentTarget.checkValidity())} className="space-y-3">
        <div><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} /></div>
        <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>
        <div className="flex justify-between gap-4"><Button type="button" variant="outline" onClick={onChangePlan}>Back</Button><Button type="submit" disabled={busy || !valid} className="bg-gradient-gold text-gold-foreground">{busy ? "Please wait…" : "Next · Create account"}</Button></div>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">Already registered? <Link to="/auth" search={{ redirect: "/join" }} className="underline">Sign in</Link></p>
    </div>
  );
}

function Wizard({ user, plan, step, setStep, onChangePlan }: { user: { id: string; email: string; name: string }; plan: string; step: number; setStep: (n: number) => void; onChangePlan: () => void }) {
  const navigate = useNavigate();
  const limit = specialtyLimit('free');
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
  const [pkgs, setPkgs] = useState<RateDraft[]>([]);
  const [ratePending, setRatePending] = useState(false);
  const [stage, setStage] = useState(""); const [tagline, setTagline] = useState(""); const [bio, setBio] = useState("");
  const [emirateId, setEmirateId] = useState(""); const [areaId, setAreaId] = useState("");
  const [languages, setLanguages] = useState("English"); const [radius, setRadius] = useState("30");
  const [trn, setTrn] = useState(""); const [agree, setAgree] = useState(false); const [busy, setBusy] = useState(false);
  const [restored,setRestored]=useState(false);const [savedPhotos,setSavedPhotos]=useState(0);
  useEffect(()=>{let alive=true;const restore=async()=>{
   try{const raw=localStorage.getItem(`join_draft:${user.id}`);if(raw){const d=JSON.parse(raw);setName(d.name??user.name);setPhone(d.phone??'');setCategoryId(d.categoryId??'');setSpecs(Array.isArray(d.specs)?d.specs:[]);setBasePrice(d.basePrice??'');setPkgs(Array.isArray(d.pkgs)?d.pkgs.map(restoreRateDraft):[]);setStage(d.stage??'');setTagline(d.tagline??'');setBio(d.bio??'');setEmirateId(d.emirateId??'');setAreaId(d.areaId??'');setLanguages(d.languages??'English');setRadius(d.radius??'30');setTrn(d.trn??'');setStep(Number.isInteger(d.step)?Math.min(4,Math.max(0,d.step)):0);}}
   catch{localStorage.removeItem(`join_draft:${user.id}`);}
   const {data:a}=await supabase.from('artists').select('*').eq('user_id',user.id).maybeSingle();if(a){const [{count},{data:rates},{data:p}]=await Promise.all([supabase.from('artist_media').select('id',{count:'exact',head:true}).eq('artist_id',a.id).eq('kind','photo'),supabase.from('rate_cards').select('*').eq('artist_id',a.id).order('sort'),supabase.from('profiles').select('display_name').eq('id',user.id).single()]);if(alive){setSavedPhotos(count??0);if(!localStorage.getItem(`join_draft:${user.id}`)){setName(p?.display_name??user.name);setPhone(a.notify_phone??'');setCategoryId(a.category_id??'');setSpecs(a.specialty_ids??[]);setStage(a.stage_name);setTagline(a.tagline??'');setBio(a.bio??'');setEmirateId(a.emirate_id??'');setAreaId(a.area_id??'');setBasePrice(String(a.base_price??''));setLanguages((a.languages??[]).join(', '));setRadius(String(a.travel_radius_km??30));setTrn(a.trn??'');if(rates?.length)setPkgs(rates.map(rateDraft));setStep((count??0)<5?1:4);}}}
   if(alive)setRestored(true);
  };void restore();return()=>{alive=false;};},[user.id]);
  useEffect(()=>{if(!restored)return;localStorage.setItem(`join_draft:${user.id}`,JSON.stringify({name,phone,categoryId,specs,basePrice,pkgs,stage,tagline,bio,emirateId,areaId,languages,radius,trn,step}));},[restored,user.id,name,phone,categoryId,specs,basePrice,pkgs,stage,tagline,bio,emirateId,areaId,languages,radius,trn,step]);
  const previews = photos.map((f) => URL.createObjectURL(f));

  const validate = (): string | null => {
    if (step === 0 && (!name.trim() || !/^\+?[0-9 ]{8,16}$/.test(phone))) return "Enter your name and a valid WhatsApp number.";
    if (step === 1 && !categoryId) return "Choose your talent category.";
    if (step === 1 && specs.length > limit) return `Your plan allows up to ${limit} specialties.`;
    if (step === 1 && photos.length+savedPhotos !== 5) return "Upload exactly 5 photos in total; saved photos are retained.";
    if (step === 2) {
      if (ratePending) return "Save or clear the current ratecard before continuing.";
      if (!Number.isFinite(Number(basePrice)) || Number(basePrice) <= 0 || !pkgs.length) return "Enter a starting price and save at least one ratecard.";
      try { pkgs.forEach(ratePayload); } catch { return "Complete each ratecard's title, base items, quantity and price."; }
    }
    if (step === 3 && (!stage.trim() || !emirateId)) return "Enter your stage name and base emirate.";
    if (step === 4 && !agree) return "Please accept the partnership contract.";
    return null;
  };
  const next = () => { const e = validate(); if (e) { toast.error(e); return; } setStep(step + 1); window.scrollTo({ top: 0 }); };

  const addPhotos = (files: FileList | null) => {
    const imgs = Array.from(files ?? []).filter((f) => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024);
    setPhotos([...photos, ...imgs].slice(0, Math.max(0,5-savedPhotos)));
  };

  const submit = async () => {
    const e = validate(); if (e) { toast.error(e); return; }
    setBusy(true);
    try {
      const rateRows = pkgs.map(ratePayload);
      if (!rateRows.length) throw new Error("Save at least one ratecard before submitting.");
      const {data:existing}=await supabase.from('artists').select('id').eq('user_id',user.id).maybeSingle();
      const profile={
        user_id: user.id, stage_name: stage.trim(), tagline: tagline || null, bio: bio || null,
        category_id: categoryId, subcategory_id: specs[0] ?? null, specialty_ids: specs, emirate_id: emirateId, area_id: areaId || null,
        base_price: Number(basePrice), languages: languages.split(",").map((s) => s.trim()).filter(Boolean),
        travel_radius_km: Number(radius) || null, notify_phone: phone.replace(/\s/g, ""), trn: trn || null,
        contract_accepted_at: new Date().toISOString(),
        intended_plan:plan,onboarding_complete:false,
        slug: `${slugify(stage)}-${Math.random().toString(36).slice(2, 6)}`, hue: Math.floor(Math.random() * 360),
      };
      const { data: a, error } = existing?await supabase.from('artists').update(profile).eq('id',existing.id).select('id').single():await supabase.from('artists').insert(profile).select('id').single();
      if (error || !a) throw new Error(error?.message ?? "Could not save profile");
      const userSave=await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", user.id);if(userSave.error)throw userSave.error;
      const {data:rates,error:rateError}=await supabase.from('rate_cards').select('id,sort').eq('artist_id',a.id);
      if(rateError)throw rateError;
      for(const [i,p] of rateRows.entries()){const row={...p,artist_id:a.id,sort:i+1};const prior=rates?.find(r=>r.sort===i+1);const save=prior?await supabase.from('rate_cards').update(row).eq('id',prior.id).eq('artist_id',a.id):await supabase.from('rate_cards').insert(row);if(save.error)throw save.error;}
      const retired=(rates??[]).filter(r=>(r.sort??0)>rateRows.length&& (r.sort??0)<=3).map(r=>r.id);
      if(retired.length){const removed=await supabase.from('rate_cards').delete().eq('artist_id',a.id).in('id',retired);if(removed.error)throw removed.error;}
      const {count:countPhotos}=await supabase.from('artist_media').select('id',{count:'exact',head:true}).eq('artist_id',a.id).eq('kind','photo');let uploaded=countPhotos??0;
      for (const [i, f] of photos.entries()) {
        if(uploaded>=5)break;
        const path = `${a.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
        const up = await supabase.storage.from("artist-media").upload(path, f, { contentType: f.type });
        if(up.error)throw up.error;
        const save=await supabase.from("artist_media").insert({ artist_id: a.id, kind: "photo", url: path, storage_path: path, sort: uploaded + 1 });
        if(save.error){await supabase.storage.from('artist-media').remove([path]);throw save.error;}uploaded++;
      }
      setSavedPhotos(uploaded);setPhotos([]);
      if(uploaded!==5)throw new Error('Profile details saved. Add the remaining portfolio photos to finish registration.');
      const done=await supabase.from('artists').update({onboarding_complete:true}).eq('id',a.id);if(done.error)throw done.error;
      localStorage.removeItem(`join_draft:${user.id}`);
      localStorage.removeItem(`join_rate_editor:${user.id}`);
      toast.success("Profile saved — one last step: payment.");
      navigate({ to: "/join/payment" });
    } catch (err) {const {data:a}=await supabase.from('artists').select('id').eq('user_id',user.id).maybeSingle();if(a){const {count}=await supabase.from('artist_media').select('id',{count:'exact',head:true}).eq('artist_id',a.id).eq('kind','photo');setSavedPhotos(count??0);setPhotos([]);}toast.error((err as Error).message+' — your progress is saved.');} finally { setBusy(false); }
  };

  const subs = cat?.subcategories.filter((s) => s.category_id === categoryId) ?? [];
  return (
    <div className="space-y-4">
      <PlanBadge plan={plan} onChange={onChangePlan} />
      <p className="text-sm text-muted-foreground">Registration starts on Free. Add more specialties after your separate subscription payment.</p>
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
          <Label>5 portfolio photos ({photos.length+savedPhotos}/5)</Label>
          {savedPhotos>0&&<p className="text-xs text-muted-foreground">{savedPhotos} photos already saved.</p>}
          <p className="text-xs text-muted-foreground">The first photo becomes your cover. Max 10 MB each.</p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {previews.map((src, i) => (
              <div key={src} className="relative aspect-square overflow-hidden rounded-lg border">
                <img src={src} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute end-1 top-1 rounded-full bg-background/90 p-1"><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
            {photos.length+savedPhotos < 5 && (
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
        <SignupRatecards packages={pkgs} onChange={setPkgs} draftKey={`join_rate_editor:${user.id}`} onPending={setRatePending} />
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
        <Button type="button" variant="outline" onClick={() => { if (step === 0) onChangePlan(); else setStep(step - 1); }}>Back</Button>
        {step < 4 ? <Button type="button" disabled={validate() !== null} onClick={next} className="bg-gradient-gold text-gold-foreground">Next</Button>
          : <Button type="button" disabled={busy || validate() !== null} onClick={submit} className="bg-gradient-gold text-gold-foreground">{busy ? "Submitting…" : "Next · Submit & continue to payment"}</Button>}
      </div>
    </div>
  );
}
