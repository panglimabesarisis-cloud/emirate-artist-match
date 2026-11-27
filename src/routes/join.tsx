import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { registrationCode } from "@/lib/job-score";
import { specialtyLimit } from "@/lib/join-rules";
import { SIGNUP_PLAN_KEY } from "@/lib/signup-plan";
import { useWhatsAppProof, WhatsAppVerify } from "@/components/shared/WhatsAppVerify";
import { normalizeVerificationPhone } from "@/lib/verification-rules";
import { readPending, splitSpecialties } from "@/lib/signup-specialties";
import { AddableLocation } from "@/components/shared/AddableLocation";
import { X } from "lucide-react";
import { SceneBackground } from "@/components/shared/SceneBackground";
import { ReferenceTheme } from "@/components/shared/ReferenceTheme";
import { SampleTestimonials } from "@/components/site/SampleTestimonials";
import { JoinRateStep } from "@/components/shared/JoinRateStep";

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

const STEPS = ["Plan", "Account", "Category & photos", "Stage identity", "Contract", "Deposit", "Rate card"];

function GoogleG() {
  return (<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>);
}

function JoinPage() {
  const [user, setUser] = useState<{ id: string; email: string; name: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [submitted, setSubmitted] = useState<{ artistId: string; paid: boolean; needsRates: boolean } | null>(null);
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [plan, setPlanState] = useState<string | null>(null);
  useEffect(() => { setPlanState(localStorage.getItem("join_plan")); }, []);
  const setPlan = (p: string | null) => { if (p) localStorage.setItem("join_plan", p); else localStorage.removeItem("join_plan"); setPlanState(p); };
  // After submitting: Deposit is the sixth circle, Rate card the seventh.
  const shown = submitted ? (submitted.paid ? 6 : 5) : plan ? step + 1 : 0;

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (u) {
        await supabase.rpc("become_artist");
        const m = u.user_metadata ?? {};
        setUser({ id: u.id, email: u.email ?? "", name: m["display_name"] ?? m["full_name"] ?? m["name"] ?? "" });
        const { data: a } = await supabase.rpc("private_artists").select("id,onboarding_complete,registration_paid_at").eq("user_id", u.id).maybeSingle();
        if (a?.onboarding_complete) {
          const paid = !!a.registration_paid_at;
          const rates = paid ? await supabase.from("rate_cards").select("id", { count: "exact", head: true }).eq("artist_id", a.id) : null;
          setSubmitted({ artistId: a.id, paid, needsRates: !!rates && !rates.error && (rates.count ?? 0) === 0 });
        }
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
        <p className="mt-1 text-muted-foreground">Choose a plan, then seven quick steps. Our team reviews profiles before they go live; with a paid subscription yours goes live as soon as the payment is confirmed.</p>
        <ol className="reference-stepper">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === shown ? "step" : undefined}>
              <div data-state={i < shown ? "done" : i === shown ? "current" : "todo"} className={`reference-step-number mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${i === shown ? "border-gold text-gold" : "text-muted-foreground"}`}>
                {i < shown ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <div className={`mt-2 hidden text-xs sm:block ${i === shown ? "font-medium" : "text-muted-foreground"}`}>{s}</div>
            </li>
          ))}
        </ol>
        </header>
        <div className={`reference-join-card${!plan && !hasProfile ? " reference-join-plans" : ""}${submitted?.needsRates ? " reference-join-rates" : ""}`}>
          {!checked ? <p className="text-muted-foreground">Loading…</p>
            : submitted?.needsRates && user ? <JoinRateStep artistId={submitted.artistId} userId={user.id} onDone={() => void navigate({ to: "/dashboard" })} />
            : submitted?.paid ? <Navigate to="/dashboard" replace />
            : hasProfile ? <div className="space-y-4 text-center"><p>Your talent profile is submitted. Pay the registration deposit to add your rate card.</p><div className="flex flex-wrap justify-center gap-3"><Button asChild className="bg-gradient-gold text-gold-foreground"><Link to="/join/payment">Pay registration deposit</Link></Button><Button asChild variant="outline" className="join-back"><Link to="/dashboard">Go to dashboard</Link></Button></div></div>
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
              <li>{t.max_categories} {t.max_categories === 1 ? "category" : "categories"} · {t.max_specialties} {t.max_specialties === 1 ? "specialty" : "specialties"}</li>
              <li>{t.ai_credits} AI credits</li>
              <li>{t.max_photos} photos · {t.max_videos} videos</li>
              <li>{Number(t.commission_pct)}% platform commission</li>
              {(Array.isArray(t.features) ? t.features as string[] : []).map((f) => <li key={f}>{f}</li>)}
            </ul>
            <Button type="button" variant="outline" onClick={() => setSelected(t.code)} className="mt-4">{selected === t.code ? "Selected" : `Choose ${t.name}`}</Button>
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-between"><Button variant="outline" className="join-back" disabled>Back</Button><Button className="reference-gold" disabled={!selected} onClick={() => { if (selected) onPick(selected); }}>Next</Button></div>
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
        <div className="flex justify-between gap-4"><Button type="button" variant="outline" className="join-back" onClick={onChangePlan}>Back</Button><Button type="submit" disabled={busy || !valid} className="bg-gradient-gold text-gold-foreground">{busy ? "Please wait…" : "Next · Create account"}</Button></div>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">Already registered? <Link to="/auth" search={{ redirect: "/join" }} className="underline">Sign in</Link></p>
    </div>
  );
}

function Wizard({ user, plan, step, setStep, onChangePlan }: { user: { id: string; email: string; name: string }; plan: string; step: number; setStep: (n: number) => void; onChangePlan: () => void }) {
  const navigate = useNavigate();
  // The plan picked on the first screen decides how many specialties can be chosen.
  const tier = useQuery({ queryKey: ["join-plan-limit", plan], queryFn: async () => (await supabase.from("plan_tiers").select("name,max_specialties").eq("code", plan).maybeSingle()).data }).data;
  const limit = tier?.max_specialties ?? specialtyLimit(plan);
  const queryClient = useQueryClient();
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
  const [stage, setStage] = useState(""); const [tagline, setTagline] = useState(""); const [bio, setBio] = useState("");
  const [emirateId, setEmirateId] = useState(""); const [areaId, setAreaId] = useState("");
  const [languages, setLanguages] = useState("English"); const [radius, setRadius] = useState("30");
  const [trn, setTrn] = useState(""); const [agree, setAgree] = useState(false); const [busy, setBusy] = useState(false);
  const [restored,setRestored]=useState(false);const [savedPhotos,setSavedPhotos]=useState(0);
  const whatsapp = useWhatsAppProof(phone);
  useEffect(()=>{let alive=true;const restore=async()=>{
   try{const raw=localStorage.getItem(`join_draft:${user.id}`);if(raw){const d=JSON.parse(raw);setName(d.name??user.name);setPhone(d.phone??'');setCategoryId(d.categoryId??'');setSpecs(Array.isArray(d.specs)?d.specs:[]);if(Array.isArray(d.pkgs)&&d.pkgs.length&&!localStorage.getItem(`join_rate_draft:${user.id}`))localStorage.setItem(`join_rate_draft:${user.id}`,JSON.stringify({basePrice:d.basePrice??'',pkgs:d.pkgs}));setStage(d.stage??'');setTagline(d.tagline??'');setBio(d.bio??'');setEmirateId(d.emirateId??'');setAreaId(d.areaId??'');setLanguages(d.languages??'English');setRadius(d.radius??'30');setTrn(d.trn??'');/* Drafts saved before the rate card moved counted it as step 2. */const savedStep=Number.isInteger(d.step)?(d.v===2||d.step<3?d.step:d.step-1):0;setStep(Math.min(3,Math.max(0,savedStep)));}}
   catch{localStorage.removeItem(`join_draft:${user.id}`);}
   const {data:a}=await supabase.rpc('private_artists').select('*').eq('user_id',user.id).maybeSingle();if(a){const [{count},{data:p}]=await Promise.all([supabase.from('artist_media').select('id',{count:'exact',head:true}).eq('artist_id',a.id).eq('kind','photo'),supabase.from('profiles').select('display_name').eq('id',user.id).single()]);if(alive){setSavedPhotos(count??0);if(!localStorage.getItem(`join_draft:${user.id}`)){setName(p?.display_name??user.name);setPhone(a.notify_phone??'');setCategoryId(a.category_id??'');const waitingFor=readPending((await supabase.auth.getUser()).data.user?.user_metadata?.['pending_specialties']);setSpecs([...new Set([...(a.specialty_ids??[]),...(waitingFor&&waitingFor.category_id===a.category_id?waitingFor.ids:[])])]);setStage(a.stage_name);setTagline(a.tagline??'');setBio(a.bio??'');setEmirateId(a.emirate_id??'');setAreaId(a.area_id??'');setLanguages((a.languages??[]).join(', '));setRadius(String(a.travel_radius_km??30));setTrn(a.trn??'');setStep((count??0)<5?1:3);}}}
   if(alive)setRestored(true);
  };void restore();return()=>{alive=false;};},[user.id]);
  useEffect(()=>{if(!restored)return;localStorage.setItem(`join_draft:${user.id}`,JSON.stringify({v:2,name,phone,categoryId,specs,stage,tagline,bio,emirateId,areaId,languages,radius,trn,step}));},[restored,user.id,name,phone,categoryId,specs,stage,tagline,bio,emirateId,areaId,languages,radius,trn,step]);
  const previews = photos.map((f) => URL.createObjectURL(f));

  const validate = (): string | null => {
    if (step === 0 && (!name.trim() || !/^\+?[0-9 ]{8,16}$/.test(phone))) return "Enter your name and a valid WhatsApp number.";
    if ((step === 0 || step === 3) && !whatsapp.ready) return "Verify your WhatsApp number in step 1.";
    if (step === 1 && !categoryId) return "Choose your talent category.";
    if (step === 1 && specs.length > limit) return `Your plan allows up to ${limit} specialties.`;
    if (step === 1 && photos.length+savedPhotos !== 5) return "Upload exactly 5 photos in total; saved photos are retained.";
    if (step === 2 && (!stage.trim() || !emirateId)) return "Enter your stage, team or corporate name and base emirate.";
    if (step === 3 && !agree) return "Please accept the partnership contract.";
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
      const {data:existing}=await supabase.rpc('private_artists').select('id, created_at').eq('user_id',user.id).maybeSingle();
      // The database only accepts what the paid plan allows; the other choices wait on the account until it is paid.
      let allowedNow=specialtyLimit('free');
      if(existing){const current=await supabase.rpc('effective_artist_plan',{_artist:existing.id});const paid=current.data?await supabase.from('plan_tiers').select('max_specialties').eq('code',current.data).maybeSingle():null;allowedNow=paid?.data?.max_specialties??allowedNow;}
      const chosen=splitSpecialties(specs,allowedNow);
      const waiting=await supabase.auth.updateUser({data:{pending_specialties:chosen.later.length?{category_id:categoryId,ids:chosen.later}:null,[SIGNUP_PLAN_KEY]:{status:'choose'}}});
      if(waiting.error)throw waiting.error;
      const profile={
        user_id: user.id, stage_name: stage.trim(), tagline: tagline || null, bio: bio || null,
        category_id: categoryId, subcategory_id: chosen.now[0] ?? null, specialty_ids: chosen.now, emirate_id: emirateId, area_id: areaId || null,
        languages: languages.split(",").map((s) => s.trim()).filter(Boolean),
        travel_radius_km: Number(radius) || null, notify_phone: normalizeVerificationPhone(phone) ?? phone.replace(/\s/g, ""), trn: trn || null,
        contract_accepted_at: new Date().toISOString(),
        intended_plan:plan,onboarding_complete:false,
        slug: `${slugify(stage)}-${registrationCode(existing?.created_at ? new Date(existing.created_at) : new Date())}`, hue: Math.floor(Math.random() * 360),
      };
      const { data: a, error } = existing?await supabase.from('artists').update(profile).eq('id',existing.id).select('id').single():await supabase.from('artists').insert(profile).select('id').single();
      if (error || !a) throw new Error(error?.message ?? "Could not save profile");
      const userSave=await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", user.id);if(userSave.error)throw userSave.error;
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
      toast.success("Profile saved. Next: the registration deposit.");
      navigate({ to: "/join/payment" });
    } catch (err) {const {data:a}=await supabase.rpc('private_artists').select('id').eq('user_id',user.id).maybeSingle();if(a){const {count}=await supabase.from('artist_media').select('id',{count:'exact',head:true}).eq('artist_id',a.id).eq('kind','photo');setSavedPhotos(count??0);setPhotos([]);}toast.error((err as Error).message+' — your progress is saved.');} finally { setBusy(false); }
  };

  const subs = cat?.subcategories.filter((s) => s.category_id === categoryId) ?? [];
  return (
    <div className="space-y-4">
      <PlanBadge plan={plan} onChange={onChangePlan} />
      {step === 0 && <>
        <h2 className="text-xl font-semibold">Step 1 · Account</h2>
        <div><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></div>
        <div><Label>Email</Label><Input value={user.email} disabled /></div>
        <div><Label htmlFor="join-whatsapp">WhatsApp number</Label><WhatsAppVerify id="join-whatsapp" phone={phone} onChange={setPhone} /><p className="mt-1 text-xs text-muted-foreground">Booking approvals are sent here.</p></div>
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
            <p className="mt-1 text-xs text-muted-foreground">Your <span className="capitalize">{plan}</span> plan allows {limit} {limit === 1 ? "specialty" : "specialties"}.{limit > 1 ? " The first shows right away; the others are added once your plan is paid." : ""}</p>
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
        <h2 className="text-xl font-semibold">Step 3 · Stage identity / Name Of Team</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Stage Name / Team Name / Corporate Name</Label><Input value={stage} onChange={(e) => setStage(e.target.value)} maxLength={80} /></div>
          <div><Label>Tagline</Label><Input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={120} /></div>
          <AddableLocation label="Base emirate" addLabel="Add new emirate" placeholder="Choose" value={emirateId} options={cat?.emirates ?? []} onChange={(v) => { setEmirateId(v); setAreaId(""); }} onAdded={() => queryClient.invalidateQueries({ queryKey: ["join-catalog"] })} />
          <AddableLocation label="Base area" addLabel="Add new area" placeholder={emirateId ? "Optional" : "Choose an emirate first"} value={areaId} options={cat?.areas.filter((a) => a.emirate_id === emirateId) ?? []} emirateId={emirateId} disabled={!emirateId} onChange={setAreaId} onAdded={() => queryClient.invalidateQueries({ queryKey: ["join-catalog"] })} />
          <div><Label>Languages (comma separated)</Label><Input value={languages} onChange={(e) => setLanguages(e.target.value)} /></div>
          <div><Label>Travel radius (km)</Label><Input type="number" value={radius} onChange={(e) => setRadius(e.target.value)} /></div>
        </div>
        <div><Label>Bio</Label><Textarea rows={5} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} /></div>
      </>}
      {step === 3 && <>
        <h2 className="text-xl font-semibold">Step 4 · Partnership contract</h2>
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
        <Button type="button" variant="outline" className="join-back" onClick={() => { if (step === 0) onChangePlan(); else setStep(step - 1); }}>Back</Button>
        {step < 3 ? <Button type="button" disabled={validate() !== null} onClick={next} className="bg-gradient-gold text-gold-foreground">Next</Button>
          : <Button type="button" disabled={busy || validate() !== null} onClick={submit} className="bg-gradient-gold text-gold-foreground">{busy ? "Submitting…" : "Next · Submit & continue to payment"}</Button>}
      </div>
    </div>
  );
}
