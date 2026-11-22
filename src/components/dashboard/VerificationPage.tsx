import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { confirmVerificationOtp, requestVerificationOtp, submitVerification } from "@/lib/verification.functions";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { StudioHeading } from "./StudioPage";
import "./reference-pages.css";
import "./reference-adapters.css";

/* Same rules as the dashboard.html mock: Verified (identity), Subscribe (paid plan) and Top (earned). */

type Kind = "w" | "b" | "g";
type VStatus = "none" | "waiting" | "review" | "rejected" | "approved";
type Pic = { file: File; url: string };
type Wiz = {
  step: number; res: "uae" | "foreign"; phone: string; nat: string; name: string; docNo: string; exp: string; dob: string;
  l1: string; city: string; ctry: string; zip: string; files: Record<string, Pic>; selfies: Record<string, Pic>; consent: boolean;
  code: string; sent: number | null; phoneOk: boolean;
};

const COUNTRIES = ["Indonesia", "India", "Pakistan", "Bangladesh", "Philippines", "Sri Lanka", "Nepal", "Egypt", "Jordan", "Lebanon", "Syria", "Sudan", "Morocco", "Tunisia", "Iran", "Turkey", "Russia", "Ukraine", "United Kingdom", "United States", "Canada", "Australia", "South Africa", "Nigeria", "Kenya", "France", "Germany", "Italy", "Spain", "Other"];
const STEP_NAMES = ["Account", "Documents", "Selfie", "Review"];
const MAX_BYTES = 10 * 1024 * 1024;
const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fd = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const blank = (res: "uae" | "foreign" = "uae"): Wiz => ({ step: 1, res, phone: "", nat: "", name: "", docNo: "", exp: "", dob: "", l1: "", city: "", ctry: "", zip: "", files: {}, selfies: {}, consent: false, code: "", sent: null, phoneOk: false });

const luhn = (s: string) => { let sum = 0, alt = false; for (let i = s.length - 1; i >= 0; i--) { let n = +s[i]!; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; } return sum % 10 === 0; };
const eidOk = (v: string) => { const d = v.replace(/-/g, ""); return /^784\d{12}$/.test(d) && luhn(d); };
const mask = (s: string) => (s.length > 4 ? `${s.slice(0, 2)}••••${s.slice(-2)}` : s);

/** The shield badge, drawn the same way as the mock. */
function Shield({ kind, state }: { kind: Kind; state: "on" | "wait" | "off" }) {
  const id = useId().replace(/:/g, "");
  const grad = { w: ["#ffffff", "#d9d0bd"], b: ["#8fd0ff", "#2f7fe0"], g: ["#f8dc8a", "#d4842a"] }[kind];
  const ink = kind === "b" ? "#ffffff" : "#14172a";
  const path = "M12 2.2l8 2.9v6c0 4.9-3.3 8.7-8 10.7-4.7-2-8-5.8-8-10.7v-6z";
  if (state === "on") {
    return <svg viewBox="0 0 24 24" className="dmr-vf-ic" role="img" aria-label={`${{ w: "Verified", b: "Subscribe", g: "Top" }[kind]} badge`}><defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={grad[0]} /><stop offset="1" stopColor={grad[1]} /></linearGradient></defs><path d={path} fill={`url(#${id})`} /><path d="M8.3 12.2l2.6 2.6 4.8-5.2" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  const wait = state === "wait";
  return <svg viewBox="0 0 24 24" className="dmr-vf-ic" role="img" aria-label={wait ? "Verification pending" : "Not earned yet"}><path d={path} fill="rgba(246,239,226,.04)" stroke={wait ? "#e8b04a" : "rgba(246,239,226,.35)"} strokeWidth="1.2" strokeDasharray={wait ? "2 1.6" : "1.5 1.5"} />{wait && <><circle cx="12" cy="11.8" r="3.6" fill="none" stroke="#e8b04a" strokeWidth="1.4" /><path d="M12 10v2l1.4.9" fill="none" stroke="#e8b04a" strokeWidth="1.4" strokeLinecap="round" /></>}</svg>;
}

const Item = ({ ok, children }: { ok: boolean; children: ReactNode }) => <li className={ok ? "ok" : ""}><i /><span>{children}</span></li>;

function useVerification(artistId: string) {
  return useQuery({
    queryKey: ["verification-page", artistId],
    queryFn: async () => {
      const [apps, badges, plan, bookings, rank] = await Promise.all([
        supabase.from("verification_applications").select("*").eq("artist_id", artistId).order("created_at", { ascending: false }),
        supabase.from("artist_badges").select("badge").eq("artist_id", artistId),
        supabase.rpc("effective_artist_plan", { _artist: artistId }),
        supabase.from("bookings").select("client_name, paid_amount, status").eq("artist_id", artistId).is("deleted_at", null).eq("is_seed", false).neq("status", "cancelled"),
        supabase.rpc("my_verification_rank", { _artist: artistId }),
      ]);
      for (const r of [apps, badges, bookings]) if (r.error) throw new Error(r.error.message);
      const clients = new Set<string>();
      for (const b of bookings.data ?? []) if (Number(b.paid_amount ?? 0) > 0) clients.add((b.client_name ?? "").toLowerCase());
      const r = (rank.data ?? null) as { percentile: number | null; next_refresh: string | null; disputes: number } | null;
      return { apps: apps.data ?? [], badges: (badges.data ?? []).map((b) => b.badge), plan: (plan.data as string | null) ?? "free", clients: clients.size, rank: r };
    },
  });
}

export function VerificationPage({ artistId, userId }: { artistId: string; userId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useVerification(artistId);
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<"uae" | "foreign">("uae");
  const [saved, setSaved] = useState<Wiz>(() => blank());

  const latest = data?.apps[0];
  const verified = !!data?.badges.some((b) => b.startsWith("verified"));
  const status: VStatus = verified ? "approved" : !latest ? "none" : latest.status === "submitted" ? "waiting" : latest.status === "under_review" ? "review" : latest.status === "approved" ? "approved" : "rejected";
  const plan = data?.plan ?? "free";
  const subscribed = verified && plan !== "free";
  const topEarned = !!data?.badges.includes("top");
  const clients = data?.clients ?? 0;
  const decidedOn = latest?.decided_at ? fd(new Date(latest.decided_at)) : "";
  const submittedOn = latest ? fd(new Date(latest.created_at)) : "";
  const reasons = (latest?.reasons?.length ? latest.reasons : latest?.admin_note ? [latest.admin_note] : []) as string[];
  const rejectedCount = (data?.apps ?? []).filter((a) => a.status === "rejected").length;
  const triesLeft = Math.max(0, 2 - rejectedCount);
  const pct = data?.rank?.percentile ?? null;
  const nextRefresh = data?.rank?.next_refresh ? fd(new Date(data.rank.next_refresh)) : "";

  const vst: [string, string] = status === "approved" ? ["ok", "Active"] : status === "waiting" ? ["wait", "Waiting"] : status === "review" ? ["wait", "In staff review"] : status === "rejected" ? ["bad", "Needs attention"] : ["", "Not started"];
  const start = () => { setSaved((w) => ({ ...blank(res), ...w, step: w.phoneOk && status === "rejected" ? 2 : 1, res, files: {}, selfies: {}, consent: false })); setOpen(true); };
  const plansToast = () => toast(t("Plans and billing open in the AI credits page."));

  const T: Record<VStatus, [string, string]> = {
    none: ["You are not verified yet", "It takes about 5 minutes. Have your phone and your passport or Emirates ID ready."],
    waiting: ["Waiting for review", `We received your application on ${submittedOn}. Our system checks it first and a person looks at anything it is unsure about. Usually 1 to 2 business days.`],
    review: ["In staff review", "A team member is checking your documents. Usually 1 to 2 business days. We may message you on WhatsApp for a short video call."],
    rejected: ["We could not verify you yet", triesLeft ? "Nothing is lost. Fix the points below and try again." : "You used both tries. Our team will look at your application by hand."],
    approved: ["You are verified", `Approved on ${decidedOn || submittedOn}. Your Verified badge is live on your public profile.`],
  };
  const sent = status !== "none" && status !== "rejected";
  const steps: [string, boolean][] = [["WhatsApp code confirmed", sent || status === "rejected"], ["Documents and selfie sent", sent || status === "rejected"], ["Checked by our system and our team", status === "approved" || status === "review"], ["Decision", status === "approved"]];
  const cur = steps.findIndex((s) => !s[1]);
  const top: [string, number, string][] = [
    ["Verified", verified ? 100 : 0, verified ? "Done" : "Not yet"],
    ["Subscribe", subscribed ? 100 : 0, subscribed ? "Active" : "Needs a paid plan"],
    ["Paying clients", Math.min(100, (clients / 3) * 100), `${clients} of 3`],
    ["Rank in your category", topEarned ? 100 : pct == null ? 0 : Math.min(100, (10 / Math.max(pct, 0.1)) * 100), pct == null ? "Calculated monthly" : `Top ${Math.max(1, Math.ceil(pct))}%, need top 10%`],
  ];
  const [grow, setGrow] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setGrow(true))); return () => cancelAnimationFrame(id); }, []);

  const typeLabel = (b: string) => ({ verified_identity: "Verified badge", verified_business: "Business verified", verified_performer: "Performer verified" }[b] ?? b);
  const hist = (s: string): [string, string] => s === "approved" ? ["ok", "Approved"] : s === "rejected" ? ["bad", "Rejected"] : s === "needs_more_info" ? ["bad", "Needs more info"] : s === "under_review" ? ["wait", "In staff review"] : ["wait", "Waiting"];

  return (
    <div className="dmr-wrap dmr-vfpage">
      <StudioHeading title="Veri" accent="fication">
        <div className="dmr-vf-hb">{([["w", "Verified", verified], ["b", "Subscribe", subscribed], ["g", "Top", topEarned]] as const).map(([k, l, o]) => <span key={k} className={`dmr-vf-bg ${o ? "" : "off"}`}><Shield kind={k} state={o ? "on" : "off"} />{t(l)}</span>)}</div>
      </StudioHeading>

      <div className="dmr-c-12 dmr-vf-ladder">
        <article className={`dmr-vf-b w${verified ? " on" : ""}`}>
          <Shield kind="w" state={verified ? "on" : status === "waiting" || status === "review" ? "wait" : "off"} />
          <span className={`dmr-vf-st ${vst[0]}`}>{t(vst[1])}</span><h3 className="dmr-serif">{t("Verified")}</h3>
          <p>{t("Proves you are the person on your documents. It stays even if you stop subscribing.")}</p>
          <ul><Item ok={sent || verified}>{t("WhatsApp code confirmed")}</Item><Item ok={verified}>{t("Passport or Emirates ID approved")}</Item><Item ok={verified}>{t("Live selfie matched")}</Item></ul>
          {status === "none" ? <button type="button" className="dmr-btn dmr-btn-gold" onClick={start}>{t("Start verification")}</button> : status === "rejected" ? <button type="button" className="dmr-btn dmr-btn-gold" onClick={start} disabled={triesLeft === 0}>{t("Fix and try again")}</button> : status === "approved" ? <button type="button" className="dmr-btn dmr-btn-line" disabled>{t("You are verified")}</button> : <button type="button" className="dmr-btn dmr-btn-line" disabled>{t("Under review")}</button>}
        </article>
        <article className={`dmr-vf-b b${subscribed ? " on" : ""}`}>
          <Shield kind="b" state={subscribed ? "on" : "off"} />
          <span className={`dmr-vf-st ${subscribed ? "ok" : ""}`}>{t(subscribed ? "Active" : "Not active")}</span><h3 className="dmr-serif">{t("Subscribe")}</h3>
          <p>{t("Shows you are a paying member. It is about your plan, not your identity, and it is a separate badge.")}</p>
          <ul><Item ok={verified}>{t("Verified badge")}</Item><Item ok={plan !== "free"}>{t("Paid plan (Basic or higher)")}</Item></ul>
          {subscribed ? <button type="button" className="dmr-btn dmr-btn-line" disabled>{plan.charAt(0).toUpperCase() + plan.slice(1)} {t("plan active")}</button> : verified ? <button type="button" className="dmr-btn dmr-btn-gold" onClick={plansToast}>{t("See plans")}</button> : <button type="button" className="dmr-btn dmr-btn-line" disabled>{t("Get verified first")}</button>}
        </article>
        <article className={`dmr-vf-b g${topEarned ? " on" : ""}`}>
          <Shield kind="g" state={topEarned ? "on" : "off"} />
          <span className={`dmr-vf-st ${topEarned ? "ok" : ""}`}>{t(topEarned ? "Earned" : "Not yet")}</span><h3 className="dmr-serif">{t("Top")}</h3>
          <p>{t("Awarded automatically to the top 10% of earners in each category over the last 6 months. It cannot be bought.")}</p>
          <ul><Item ok={verified}>{t("Verified")}</Item><Item ok={subscribed}>{t("Subscribe")}</Item><Item ok={clients >= 3}>{t("3 or more paying clients")} ({clients})</Item><Item ok={pct != null && pct <= 10}>{t("Top 10% in your category")}{pct != null ? ` (${t("you")}: top ${Math.max(1, Math.ceil(pct))}%)` : ""}</Item></ul>
          <button type="button" className="dmr-btn dmr-btn-line" disabled>{t("Earned automatically")}</button>
        </article>
      </div>

      <div className="dmr-w-left">
        <section className="dmr-panel">
          <div className="dmr-vf-sp">
            <Shield kind="w" state={verified ? "on" : status === "waiting" || status === "review" ? "wait" : "off"} />
            <div><h2 className="dmr-serif">{t(T[status][0])}</h2><p>{t(T[status][1])}</p>
              {status === "rejected" && <div className="dmr-vf-rs"><b>{t("What went wrong")}</b><ul>{(reasons.length ? reasons : ["Our team asked for a change. Check the note in your applications below."]).map((r) => <li key={r}>{r}</li>)}</ul></div>}
              {(status === "none" || (status === "rejected" && triesLeft > 0)) && <div className="dmr-bt"><button type="button" className="dmr-btn dmr-btn-gold" onClick={start}>{status === "none" ? t("Start verification") : `${t("Try again")} (${triesLeft} ${t("left")})`}</button></div>}
            </div>
          </div>
          <ol className="dmr-vf-tl">{steps.map(([l, ok], i) => <li key={l} className={ok ? "ok" : i === cur ? "cur" : ""}><i /><span>{t(l)}</span></li>)}</ol>
        </section>

        <section className="dmr-panel">
          <div className="dmr-a-top"><div><h2 className="dmr-serif">{t("Road to the")} <span className="it">{t("Top badge")}</span></h2><p>{t("Top is earned, not bought. It goes to the best earners in each category over the last 6 months.")}</p></div><span className={`dmr-vf-st ${topEarned ? "ok" : ""}`}>{t(topEarned ? "Earned" : "Not yet")}</span></div>
          <div className="dmr-vf-pg">{top.map(([l, p, v]) => <div key={l}><div className="dmr-vt"><span>{t(l)}</span><b>{t(v)}</b></div><div className="dmr-ln"><i style={{ width: `${grow ? p : 0}%` }} /></div></div>)}</div>
          <p className="dmr-cr-note" style={{ marginTop: 12 }}>{t("Only money released from escrow counts, with no open disputes. Ranking is recalculated on the 1st of each month.")}{nextRefresh ? ` ${t("Next on")} ${nextRefresh}.` : ""} {t("You never see other talents' earnings.")}</p>
        </section>

        <section className="dmr-panel dmr-q-panel" aria-label={t("Applications")}>
          <div className="dmr-q-tools"><div className="dmr-ct-h"><h2 className="dmr-serif">{t("Your")} <span className="it">{t("applications")}</span></h2><small>{t("Every verification request and its result")}</small></div></div>
          {!!data?.apps.length && <div className="dmr-tbl-wrap"><table className="dmr-qt dmr-wt"><thead><tr>{["Date", "Type", "Status", "Note"].map((h) => <th key={h}>{t(h)}</th>)}</tr></thead><tbody>{data.apps.map((a) => { const [c, l] = hist(a.status); return <tr key={a.id}><td data-label={t("Date")}>{fd(new Date(a.created_at))}</td><td data-label={t("Type")}><b>{t(typeLabel(a.badge_type))}</b></td><td data-label={t("Status")}><span className={`dmr-vf-st ${c}`}>{t(l)}</span></td><td data-label={t("Note")} style={{ color: "var(--muted-foreground)" }}>{a.admin_note ?? (a.status === "approved" ? t("Verified badge granted") : t("Under review, usually 1 to 2 business days"))}</td></tr>; })}</tbody></table></div>}
          {!data?.apps.length && <div className="dmr-q-empty"><span className="dmr-orb"><BadgeCheck aria-hidden="true" /></span><b className="dmr-serif">{t("No applications yet")}</b><p>{t("Start your verification above. It takes about 5 minutes.")}</p></div>}
        </section>
      </div>

      <div className="dmr-w-side">
        <section className="dmr-panel">
          <h2 className="dmr-serif" style={{ fontSize: 22 }}>{t("What you")} <span className="it">{t("need")}</span></h2>
          <div className="dmr-vf-doc">
            <div className="dmr-vz-rad" style={{ gridTemplateColumns: "1fr 1fr" }} role="group" aria-label={t("Where do you live")}>
              <button type="button" className={`dmr-btn ${res === "uae" ? "dmr-btn-gold" : "dmr-btn-line"}`} style={{ padding: "9px 10px", fontSize: 12.5, justifyContent: "center" }} onClick={() => setRes("uae")}>{t("UAE resident")}</button>
              <button type="button" className={`dmr-btn ${res === "uae" ? "dmr-btn-line" : "dmr-btn-gold"}`} style={{ padding: "9px 10px", fontSize: 12.5, justifyContent: "center" }} onClick={() => setRes("foreign")}>{t("Not in the UAE")}</button>
            </div>
            {res === "uae" ? <><div><b>{t("Emirates ID")}</b>, {t("front and back, valid.")}</div><div><b>{t("Full name")}</b> {t("as on the card, and the ID number.")}</div></> : <><div><b>{t("Passport")}</b> {t("photo page, valid.")}</div><div><b>{t("Full name, nationality, date of birth")}</b> {t("and")} <b>{t("full home address")}</b>.</div><div>{t("A national ID photo only if we ask for it.")}</div></>}
            <div><b>{t("A live selfie")}</b>, {t("3 quick poses.")}</div>
            <div style={{ color: "var(--muted-foreground)" }}>{t("Name on the documents must match your payout account holder.")}</div>
          </div>
        </section>
        <section className="dmr-panel">
          <h2 className="dmr-serif" style={{ fontSize: 22 }}>{t("How we protect")} <span className="it">{t("your data")}</span></h2>
          <ul className="dmr-cr-how">
            <li><b>{t("Private and encrypted.")}</b> {t("Your photos and documents are stored privately. Only our verification team can open them, and every access is logged.")}</li>
            <li><b>{t("Deleted after 30 days.")}</b> {t("Once we decide, photos are deleted. We keep only the result.")}</li>
            <li><b>{t("You consent separately.")}</b> {t("Face matching needs your clear consent, and you can withdraw it any time.")}</li>
            <li><b>{t("A person checks doubts.")}</b> {t("If our AI is unsure, a staff member reviews it. You are never rejected by AI alone.")}</li>
          </ul>
        </section>
      </div>

      {open && <Wizard artistId={artistId} userId={userId} initial={saved} onClose={(w) => { if (w) setSaved(w); setOpen(false); }} onDone={() => { setOpen(false); setSaved(blank(res)); void qc.invalidateQueries({ queryKey: ["verification-page", artistId] }); toast.success(t("Application sent. Status: Waiting")); }} />}
    </div>
  );
}

function Wizard({ artistId, userId, initial, onClose, onDone }: { artistId: string; userId: string; initial: Wiz; onClose: (w?: Wiz) => void; onDone: () => void }) {
  const { t } = useI18n();
  const [w, setW] = useState<Wiz>(initial);
  const sendOtp = useServerFn(requestVerificationOtp);
  const checkOtp = useServerFn(confirmVerificationOtp);
  const submitFn = useServerFn(submitVerification);
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return; const id = window.setTimeout(() => setWait((x) => x - 1), 1000); return () => window.clearTimeout(id); }, [wait]);
  const [err, setErr] = useState("");
  const [hints, setHints] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const wRef = useRef(w); wRef.current = w;
  const dlgRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  const u = w.res === "uae";
  const set = (p: Partial<Wiz>) => setW((x) => ({ ...x, ...p }));
  const today = useMemo(() => iso(new Date()), []);

  const close = () => { onClose(wRef.current); (lastFocus.current as HTMLElement | null)?.focus?.(); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); return; }
      if (e.key !== "Tab" || !dlgRef.current) return;
      const f = [...dlgRef.current.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled]):not([type=file]),select")].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const a = f[0]!, z = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    const x = dlgRef.current?.querySelector<HTMLElement>("input:not([disabled]):not([type=radio]):not([type=file]),select");
    const id = window.setTimeout(() => x?.focus({ preventScroll: true }), 30);
    return () => window.clearTimeout(id);
  }, [w.step]);

  const addFile = (group: "files" | "selfies", key: string, f: File | undefined) => {
    if (!f) return;
    if (!IMG_TYPES.includes(f.type)) return setErr(t("Use a JPG, PNG or WebP photo."));
    if (f.size > MAX_BYTES) return setErr(t("That photo is over 10 MB."));
    setErr("");
    const old = w[group][key]; if (old) URL.revokeObjectURL(old.url);
    set({ [group]: { ...w[group], [key]: { file: f, url: URL.createObjectURL(f) } } } as Partial<Wiz>);
  };
  const dropFile = (group: "files" | "selfies", key: string) => {
    const old = w[group][key]; if (old) URL.revokeObjectURL(old.url);
    const next = { ...w[group] }; delete next[key]; set({ [group]: next } as Partial<Wiz>);
  };

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, extra: Record<string, string | number> = {}) => (
    <div className="dmr-qe-f"><label htmlFor={id}>{t(label)}</label><input id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" aria-invalid={hints[id] ? true : undefined} {...extra} /><span className={`dmr-f-hint${hints[id] ? " bad" : ""}`}>{hints[id] ?? ""}</span></div>
  );
  const select = (id: string, label: string, value: string, onChange: (v: string) => void) => (
    <div className="dmr-qe-f"><label htmlFor={id}>{t(label)}</label><select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={hints[id] ? true : undefined}><option value="">{t("Choose")}</option>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select><span className={`dmr-f-hint${hints[id] ? " bad" : ""}`}>{hints[id] ?? ""}</span></div>
  );
  const tile = (group: "files" | "selfies", k: string, label: string, sub: string) => {
    const f = w[group][k];
    return <div className={`dmr-vz-tile${f ? " has" : ""}`}>{f ? <><img src={f.url} alt={`${label} preview`} /><button type="button" className="dmr-rm" aria-label={`Remove ${label}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); dropFile(group, k); }}>×</button></> : <><b>{t(label)}</b><span>{t(sub)}</span></>}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={label} onChange={(e) => { addFile(group, k, e.target.files?.[0]); e.target.value = ""; }} /></div>;
  };

  const sendCode = async () => {
    if (!/^\+[1-9]\d{7,14}$/.test(w.phone)) { setHints({ "vz-ph": t("Enter your number with the country code, for example +971501234567.") }); return; }
    setHints({}); setErr(""); setBusy(true);
    try {
      const r = await sendOtp({ data: { phone: w.phone } });
      if (!r.ok) {
        const m: Record<string, string> = { invalid_phone: t("Enter your number with the country code, for example +971501234567."), not_configured: t("WhatsApp codes are not switched on yet. Please contact support."), send_failed: t("We could not send the code. Try again in a minute."), forbidden: t("Only the artist account can verify.") };
        if (r.error === "rate_limited") { setWait(r.retry_after ?? 30); setHints({ "vz-ph": t("Please wait before asking for another code.") }); }
        else setHints({ "vz-ph": m[r.error] ?? t("We could not send the code.") });
        return;
      }
      set({ sent: Date.now(), code: "" }); setWait(r.resend_after ?? 30);
    } catch { setErr(t("We could not send the code. Try again.")); } finally { setBusy(false); }
  };

  const next = async () => {
    setErr(""); const h: Record<string, string> = {};
    if (w.step === 1) {
      if (!u && !w.nat) { setHints({ "vz-nat": t("Choose your nationality.") }); return; }
      if (!w.phoneOk) {
        if (!w.sent) return setErr(t("Send the code to your WhatsApp first."));
        if (!/^\d{6}$/.test(w.code)) { setHints({ "vz-code": t("Enter the 6 digit code.") }); return; }
        setBusy(true);
        try {
          const r = await checkOtp({ data: { code: w.code } });
          if (!r.ok) {
            const m: Record<string, string> = { expired: t("This code expired. Send a new one."), too_many: t("Too many wrong codes. Send a new code."), forbidden: t("Only the artist account can verify."), not_configured: t("WhatsApp codes are not switched on yet. Please contact support.") };
            setHints({ "vz-code": r.error === "wrong_code" ? `${t("That code is not right.")} ${r.tries_left ?? 0} ${t("tries left.")}` : m[r.error] ?? t("Could not check the code.") });
            if (r.error === "too_many" || r.error === "expired") set({ sent: null, code: "" });
            return;
          }
          toast.success(t("WhatsApp number confirmed"));
          setHints({}); set({ phoneOk: true, step: 2 });
        } catch { setErr(t("Could not check the code. Try again.")); } finally { setBusy(false); }
        return;
      }
      setHints({}); set({ step: 2 }); return;
    }
    if (w.step === 2) {
      if (!/^[\p{L}][\p{L} .'-]*\s[\p{L} .'-]+$/u.test(w.name) || w.name.length < 4) h["vz-name"] = t("Enter your full name, first and last.");
      if (u) {
        if (!eidOk(w.docNo)) h["vz-doc"] = t("That Emirates ID number does not look right. It starts with 784 and has 15 digits.");
        if (!w.exp || w.exp <= today) h["vz-exp"] = t("Enter a future expiry date. Expired cards cannot be used.");
      } else {
        if (!/^[A-Za-z0-9]{6,9}$/.test(w.docNo)) h["vz-doc"] = t("Passport numbers have 6 to 9 letters and digits.");
        if (!w.nat) h["vz-nat"] = t("Choose your nationality.");
        const d = new Date(); d.setFullYear(d.getFullYear() - 18);
        if (!w.dob || w.dob > iso(d)) h["vz-dob"] = t("You must be at least 18, enter your date of birth.");
        if (!w.exp || w.exp <= today) h["vz-exp"] = t("Enter a future expiry date. Expired passports cannot be used.");
        if (w.l1.length < 5) h["vz-l1"] = t("Enter your street and building.");
        if (!w.city) h["vz-city"] = t("Enter your city.");
        if (!w.ctry) h["vz-ctry"] = t("Choose your country.");
      }
      setHints(h);
      const first = Object.keys(h)[0];
      if (first) { dlgRef.current?.querySelector<HTMLElement>(`#${first}`)?.focus(); return; }
      if (u ? !w.files["front"] || !w.files["back"] : !w.files["pass"]) return setErr(u ? t("Add a photo of both sides of your Emirates ID.") : t("Add a photo of your passport page."));
      set({ step: 3 }); return;
    }
    if (w.step === 3) {
      if (!w.selfies["c"] || !w.selfies["l"] || !w.selfies["r"]) return setErr(t("Add all three selfies."));
      set({ step: 4 }); return;
    }
    if (!w.consent) return setErr(t("Please agree to the face check to continue."));
    setBusy(true);
    try {
      const stamp = Date.now();
      const up = async (k: string, p: Pic) => {
        const path = `${userId}/${stamp}-${k}-${p.file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
        const r = await supabase.storage.from("verification-docs").upload(path, p.file, { contentType: p.file.type });
        if (r.error) throw new Error(r.error.message);
        return path;
      };
      const KIND: Record<string, string> = { front: "id_front", back: "id_back", pass: "passport", nid: "national_id" };
      const SELFIE: Record<string, string> = { c: "selfie_center", l: "selfie_left", r: "selfie_right" };
      const files: { kind: string; storage_path: string }[] = [];
      for (const [k, p] of Object.entries(w.files)) files.push({ kind: KIND[k]!, storage_path: await up(k, p) });
      for (const [k, p] of Object.entries(w.selfies)) files.push({ kind: SELFIE[k]!, storage_path: await up(`selfie-${k}`, p) });
      const details = {
        residency: w.res, full_name: w.name, doc_number: u ? w.docNo.replace(/-/g, "") : w.docNo, doc_expiry: w.exp, phone: w.phone,
        ...(u ? {} : { dob: w.dob, nationality: w.nat, address: { street: w.l1, city: w.city, country: w.ctry, ...(w.zip ? { postal_code: w.zip } : {}) } }),
      };
      const r = await submitFn({ data: { artistId, details, files } as never });
      if (!r.ok) {
        const m: Record<string, string> = { phone_not_confirmed: t("Confirm your WhatsApp number again."), application_exists: t("You already have an application in review."), staff_review_required: t("You used both tries. Our team will look at your application by hand."), invalid_details: t("Some details look wrong. Go back and check them."), invalid_files: t("A photo could not be used. Add the photos again."), forbidden: t("Only the artist account can verify.") };
        await supabase.storage.from("verification-docs").remove(files.map((f) => f.storage_path));
        setErr(m[r.error] ?? t("Could not send the application."));
        return;
      }
      [...Object.values(w.files), ...Object.values(w.selfies)].forEach((p) => URL.revokeObjectURL(p.url));
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("Could not send the application."));
    } finally { setBusy(false); }
  };

  const back = () => { if (w.step > 1) { setErr(""); set({ step: w.step - 1 }); } };
  const rows: [string, string][] = u
    ? [["Residency", "UAE resident"], ["WhatsApp", w.phone], ["Full name", w.name], ["Emirates ID", mask(w.docNo.replace(/-/g, ""))], ["Expires", w.exp], ["Photos", "2 card photos, 3 selfies"]]
    : [["Residency", "Not a UAE resident"], ["WhatsApp", w.phone], ["Full name", w.name], ["Nationality", w.nat], ["Passport", mask(w.docNo)], ["Date of birth", w.dob], ["Expires", w.exp], ["Address", [w.l1, w.city, w.ctry, w.zip].filter(Boolean).join(", ")], ["Photos", `${w.files["nid"] ? "Passport and national ID" : "Passport"}, 3 selfies`]];

  return (
    <div className="dmr-dlg-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="dmr-vz" ref={dlgRef} role="dialog" aria-modal="true" aria-labelledby="vz-h">
        <div className="dmr-vz-top"><div><h2 className="dmr-serif" id="vz-h">{t("Get")} <span className="it">{t("verified")}</span></h2><p>{t("Step")} {w.step} {t("of 4")}: {t(STEP_NAMES[w.step - 1]!)}</p></div><button type="button" className="dmr-icon-btn" onClick={close} aria-label={t("Close verification")}><X width={16} height={16} /></button></div>
        <ol className="dmr-vz-steps" aria-hidden="true">{[1, 2, 3, 4].map((n) => <li key={n} className={n < w.step ? "ok" : n === w.step ? "cur" : ""} />)}</ol>
        <div className="dmr-vz-body">
          {w.step === 1 && <>
            <div className="dmr-vz-sn">{t("Where do you live")}</div>
            <div className="dmr-vz-rad" role="radiogroup" aria-label={t("Residency")}>
              <label><input type="radio" name="res" checked={u} onChange={() => set({ res: "uae" })} /><span>{t("UAE resident")}<small>{t("You have an Emirates ID")}</small></span></label>
              <label><input type="radio" name="res" checked={!u} onChange={() => set({ res: "foreign" })} /><span>{t("Not a UAE resident")}<small>{t("You use your passport")}</small></span></label>
            </div>
            {!u && select("vz-nat", "Nationality", w.nat, (v) => set({ nat: v }))}
            <div className="dmr-vz-sn" style={{ marginTop: 6 }}>{t("Confirm your WhatsApp number")}</div>
            <div className="dmr-vz-ph">
              <div className="dmr-qe-f"><label htmlFor="vz-ph">{t("WhatsApp number")}</label><input id="vz-ph" inputMode="tel" value={w.phone} placeholder="+971 50 123 4567" autoComplete="off" disabled={w.phoneOk} aria-invalid={hints["vz-ph"] ? true : undefined} onChange={(e) => set({ phone: e.target.value.replace(/[\s()-]/g, "") })} /><span className={`dmr-f-hint${hints["vz-ph"] ? " bad" : ""}`}>{hints["vz-ph"] ?? ""}</span></div>
              <button type="button" className="dmr-btn dmr-btn-line" disabled={w.phoneOk || busy || wait > 0} onClick={() => void sendCode()}>{wait > 0 ? `${t("Resend in")} ${wait}s` : w.sent ? t("Resend code") : t("Send code")}</button>
            </div>
            {w.sent && !w.phoneOk && <div className="dmr-qe-f"><label htmlFor="vz-code">{t("6 digit code")}</label><input id="vz-code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={w.code} aria-invalid={hints["vz-code"] ? true : undefined} onChange={(e) => set({ code: e.target.value.replace(/\D/g, "") })} /><span className={`dmr-f-hint${hints["vz-code"] ? " bad" : ""}`}>{hints["vz-code"] ?? t("The code is valid for 5 minutes. It arrives on WhatsApp.")}</span></div>}
            {w.phoneOk && <div className="dmr-vz-note" style={{ color: "#7bd88f" }}>{t("Number confirmed.")}</div>}
          </>}
          {w.step === 2 && <>
            <div className="dmr-vz-sn">{t(u ? "Your Emirates ID" : "Your passport")}</div>
            {field("vz-name", u ? "Full name (as on the card)" : "Full name (as on the passport)", w.name, (v) => set({ name: v }), { maxLength: 80 })}
            {u ? <div className="dmr-a-grid">{field("vz-doc", "Emirates ID number", w.docNo, (v) => set({ docNo: v }), { placeholder: "784-YYYY-NNNNNNN-N", maxLength: 18, inputMode: "numeric" })}{field("vz-exp", "Expiry date", w.exp, (v) => set({ exp: v }), { type: "date" })}</div>
              : <div className="dmr-a-grid">{field("vz-doc", "Passport number", w.docNo, (v) => set({ docNo: v }), { maxLength: 9 })}{select("vz-nat", "Nationality", w.nat, (v) => set({ nat: v }))}{field("vz-dob", "Date of birth", w.dob, (v) => set({ dob: v }), { type: "date" })}{field("vz-exp", "Passport expiry date", w.exp, (v) => set({ exp: v }), { type: "date" })}</div>}
            {!u && <><div className="dmr-vz-sn" style={{ marginTop: 4 }}>{t("Home address")}</div>{field("vz-l1", "Street and building", w.l1, (v) => set({ l1: v }), { maxLength: 120 })}<div className="dmr-a-grid">{field("vz-city", "City", w.city, (v) => set({ city: v }), { maxLength: 60 })}{select("vz-ctry", "Country", w.ctry, (v) => set({ ctry: v }))}</div>{field("vz-zip", "Postal code (optional)", w.zip, (v) => set({ zip: v }), { maxLength: 12 })}</>}
            <div className="dmr-vz-up">{u ? <>{tile("files", "front", "Front of the card", "JPG or PNG, up to 10 MB")}{tile("files", "back", "Back of the card", "JPG or PNG, up to 10 MB")}</> : <>{tile("files", "pass", "Passport photo page", "Clear, all four corners")}{tile("files", "nid", "National ID (optional)", "Only if you have it")}</>}</div>
            <div className="dmr-vz-note">{t("Use a bright place and avoid glare. We do not accept screenshots or edited photos.")}</div>
          </>}
          {w.step === 3 && <>
            <div className="dmr-vz-sn">{t("Live selfie check")}</div>
            <div className="dmr-vz-note">{t("Three quick photos of your face with no hat or glasses. In the live app this is one short guided video.")}</div>
            <div className="dmr-vz-up">{tile("selfies", "c", "Look straight", "Face the camera")}{tile("selfies", "l", "Turn left", "Slowly turn your head")}{tile("selfies", "r", "Turn right", "Slowly turn your head")}</div>
          </>}
          {w.step === 4 && <>
            <div className="dmr-vz-sn">{t("Check and send")}</div>
            <div className="dmr-vz-sum">{rows.map(([k, v]) => <div key={k}><span>{t(k)}</span><b>{t(v)}</b></div>)}</div>
            <label className="dmr-vz-ck"><input type="checkbox" checked={w.consent} onChange={(e) => set({ consent: e.target.checked })} /><span>{t("I agree that Dealmaker may match my face with my document photo to verify my identity. I can withdraw this consent at any time. Photos are deleted 30 days after the decision.")}</span></label>
            <div className="dmr-vz-note">{t("After you send this, the status becomes")} <b>{t("Waiting")}</b>. {t("If our system is unsure, a person reviews it. You are never rejected by AI alone.")}</div>
          </>}
        </div>
        <div className="dmr-vz-foot"><button type="button" className="dmr-btn dmr-btn-line" onClick={back} style={{ visibility: w.step === 1 ? "hidden" : "visible" }}>{t("Back")}</button><p className="dmr-qe-err" role="alert">{err}</p><button type="button" className="dmr-btn dmr-btn-gold" onClick={() => void next()} disabled={busy}>{t(w.step === 4 ? "Submit application" : "Continue")}</button></div>
      </div>
    </div>
  );
}
