import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { initials } from "@/lib/format";
import { useArtistPlan } from "./PromptLibrary";
import { toInvoiceRows, useInvoiceQuery } from "./InvoiceRecords";

type Live = {
  stage_name?: string | null; tagline?: string | null; bio?: string | null; base_price?: number | null; travel_radius_km?: number | null;
  languages?: string[] | null; skills?: string[] | null; body?: unknown;
};
export type ProfileNames = { category: string; speciality: string; emirate: string; area: string };

const aed = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n0 = (n: number) => Math.round(n).toLocaleString("en-US");
const panel = "dmr-panel";
const title = "font-display text-[22px] leading-tight";
const note = "mb-2.5 mt-1.5 text-xs text-muted-foreground";
const sub = "mt-3.5 text-[10.5px] font-extrabold uppercase tracking-[.12em] text-muted-foreground";

/** The panels beside the profile form: how clients see you, your details, profile strength, job progress and cash flow. Updates as you type. */
export function ProfileSide({ artistId, v, photoPath, names }: { artistId: string; v: Live; photoPath: string | null; names: ProfileNames }) {
  const { t } = useI18n();
  const body = (v.body && typeof v.body === "object" && !Array.isArray(v.body) ? v.body : {}) as Record<string, unknown>;
  const works = useQuery({ queryKey: ["portfolio", artistId], queryFn: async () => (await supabase.from("artist_portfolio").select("id").eq("artist_id", artistId)).data ?? [] });
  const clients = useQuery({ queryKey: ["clients", artistId], queryFn: async () => (await supabase.from("artist_clients").select("id, is_public").eq("artist_id", artistId)).data ?? [] });
  const stats = useQuery({
    queryKey: ["profile-stats", artistId],
    queryFn: async () => {
      const [c, q, b, w, cr] = await Promise.all([
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("artist_id", artistId),
        supabase.from("quote_requests").select("id", { count: "exact", head: true }).eq("artist_id", artistId).is("deleted_at", null),
        supabase.from("bookings").select("conversation_id, status, paid_amount").eq("artist_id", artistId).is("deleted_at", null).eq("is_seed", false).neq("status", "cancelled"),
        supabase.rpc("artist_wallet", { _artist: artistId }),
        supabase.from("credit_wallets").select("balance").eq("artist_id", artistId).maybeSingle(),
      ]);
      return { chats: c.count ?? 0, quotes: q.count ?? 0, bookings: b.data ?? [], wallet: w.data?.[0], credits: cr.data?.balance ?? 0 };
    },
  });
  const plan = useArtistPlan(artistId);
  const invoices = toInvoiceRows(useInvoiceQuery(artistId).data ?? []);

  const bioLen = (v.bio ?? "").trim().length;
  const nameOk = (v.stage_name ?? "").trim().length >= 2;
  const isModel = /model/i.test(names.category);
  const checks: [string, boolean, string][] = [
    ["Profile photo", !!photoPath, "#pf-photo"], ["Tagline", (v.tagline ?? "").trim().length >= 5, "#pf-tagline"], ["Bio of 150 characters or more", bioLen >= 150, "#pf-bio"],
    ["A speciality", !!names.speciality, "#pf-spec"], ["Three or more skills", (v.skills ?? []).length >= 3, "#skill-draft"], ["Starting price and location", !!v.base_price && !!names.area, "#pf-price"],
    ["Languages", (v.languages ?? []).length > 0, "#pf-lang"], ["One work in your portfolio", (works.data?.length ?? 0) > 0, "#pf-po-s"], ["One client", (clients.data?.length ?? 0) > 0, "#pf-cl-s"],
  ];
  if (isModel) checks.splice(6, 0, ["Height, weight and hair color", !!(body["height_cm"] && body["weight_kg"] && body["hair"]), "#body-height_cm"]);
  const done = checks.filter((c) => c[1]).length;
  const pct = Math.round((done / checks.length) * 100);
  const go = (sel: string) => { const el = document.querySelector<HTMLElement>(sel); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); window.setTimeout(() => el.focus?.({ preventScroll: true }), 350); } };

  const no = <span className="font-semibold text-red-300/90">{t("Not set")}</span>;
  const optional = <span className="text-muted-foreground/60">{t("Optional")}</span>;
  const tags = (a: string[]) => a.length ? <div className="flex flex-wrap gap-1.5">{a.map((x) => <span key={x} className="rounded-full border border-border px-2 py-0.5 text-[11px]">{x}</span>)}</div> : no;
  const rows: [string, React.ReactNode][] = [
    ["Stage name", nameOk ? v.stage_name : no], ["Tagline", (v.tagline ?? "").trim() ? v.tagline : no], ["Photo", photoPath ? <span className="text-emerald-300">{t("Uploaded")}</span> : no],
    ["Category", names.category ? tags([names.category]) : no], ["Speciality", names.speciality ? tags([names.speciality]) : no], ["Skills", tags(v.skills ?? [])],
    ["Emirate", names.emirate || no], ["Base area", names.area || no], ["Starting price", v.base_price ? `AED ${n0(Number(v.base_price))}` : no], ["Travel radius", v.travel_radius_km != null ? `${v.travel_radius_km} km` : no], ["Languages", tags(v.languages ?? [])],
    ["Height and weight", body["height_cm"] || body["weight_kg"] ? [body["height_cm"] && `${body["height_cm"]} cm`, body["weight_kg"] && `${body["weight_kg"]} kg`].filter(Boolean).join(" · ") : isModel ? no : optional],
    ["Hair and eyes", body["hair"] || body["eyes"] ? [body["hair"], body["eyes"] && `${body["eyes"]} ${t("eyes")}`].filter(Boolean).join(" · ") : isModel ? no : optional],
    ["Bio", bioLen >= 150 ? <span className="text-emerald-300">{bioLen} {t("characters")}</span> : <span className="text-red-300/90">{bioLen} {t("of 150 characters")}</span>],
    ["Portfolio", `${works.data?.length ?? 0} ${t("works")}`], ["Clients", `${clients.data?.length ?? 0} (${(clients.data ?? []).filter((c) => c.is_public).length} ${t("public")})`], ["Plan", plan.data?.mine?.name ?? "-"],
  ];

  const S = [["paid", "Paid", "#7bd88f"], ["partial", "Partial", "#e8b04a"], ["unpaid", "Unpaid", "#e58a8a"]].map(([k, l, c]) => {
    const list = invoices.filter((i) => (i.status === "paid" ? "paid" : i.paid > 0 ? "partial" : "unpaid") === k);
    return { k: k!, l: l!, c: c!, n: list.length, amt: list.reduce((a, i) => a + Number(i.total), 0) };
  });
  const tot = invoices.length;
  let off = 0;
  const arcs = tot ? S.filter((s) => s.n).map((s, _i, all) => { const p = (s.n / tot) * 100, d = Math.max(0, p - (all.length > 1 ? 1.2 : 0)); const el = <circle key={s.k} cx="18" cy="18" r="15.9155" fill="none" strokeWidth="4.2" stroke={s.c} strokeDasharray={`${d.toFixed(2)} ${(100 - d).toFixed(2)}`} strokeDashoffset={(-off).toFixed(2)} />; off += p; return el; }) : null;
  const st = stats.data;
  const inquiryChats = st ? st.chats - new Set(st.bookings.map((b) => b.conversation_id).filter(Boolean)).size : 0;
  const inquiries = (st?.quotes ?? 0) + Math.max(0, inquiryChats);
  const completed = (st?.bookings ?? []).filter((b) => b.status === "completed").length;
  const R: [string, string, number, string][] = [
    ["Incoming chats", "Inbox", st?.chats ?? 0, "#e8b04a"],
    ["Total inquiry", `${st?.quotes ?? 0} ${t("quote requests")} + ${Math.max(0, inquiryChats)} ${t("chat inquiries")}`, inquiries, "#7bd88f"],
    ["Job completed", `${t("of")} ${st?.bookings.length ?? 0} ${t("bookings")}`, completed, "#c8662a"],
  ];
  const mx = Math.max(1, ...R.map((r) => r[2]));

  const w = st?.wallet;
  const revenue = Number(w?.net ?? 0), withdrawn = Number(w?.paid_out ?? 0) + Number(w?.pending ?? 0);
  const balance = Math.round((revenue - withdrawn) * 100) / 100;
  const share = revenue > 0 ? Math.min(100, (withdrawn / revenue) * 100) : 0;
  const cash: [string, React.ReactNode, string?][] = [
    ["Subscribe type", plan.data?.mine?.name ?? "-", `${Number(w?.commission_pct ?? 0)}% ${t("platform fee")}`], ["Total revenue", aed(revenue), t("Net of fee, completed jobs")], ["Wallet cash", aed(Number(w?.available ?? 0)), t("Released, ready to withdraw")],
    ["Withdraw", aed(withdrawn), `${aed(Number(w?.paid_out ?? 0))} ${t("paid")} · ${aed(Number(w?.pending ?? 0))} ${t("pending")}`], ["Balance", aed(balance)], ["Credit AI", `${Number(st?.credits ?? 0).toLocaleString("en-US")} ${t("credits")}`],
  ];

  return (
    <div className="dmr-w-side">
      <section className={panel} aria-labelledby="pf-pv-h">
        <h2 id="pf-pv-h" className={title}>{t("How clients")} <span className="it">{t("see you")}</span></h2>
        <div className="flex flex-col items-center gap-1.5 py-1.5 text-center">
          <span className="mt-1.5 grid h-[84px] w-[84px] place-items-center rounded-full border border-border bg-gradient-to-br from-[#2b3460] to-[#151a30] font-display text-3xl">{initials(v.stage_name || "?")}</span>
          <h3 className="mt-1.5 font-display text-[26px] font-normal">{v.stage_name || t("Your name")}</h3>
          <p className="text-[13px] text-muted-foreground">{v.tagline || t("Your tagline")}</p>
          <div className="mt-1.5 flex flex-wrap justify-center gap-1.5"><span className="rounded-full border border-border px-2.5 py-1 text-[11.5px] font-bold">{names.speciality || names.category || t("Category")}</span></div>
          <div className="text-xs text-muted-foreground">{t("From")} <b className="text-foreground">AED {n0(Number(v.base_price ?? 0))}</b> · {[names.area, names.emirate].filter(Boolean).join(", ")}</div>
        </div>
      </section>

      <section className={panel} aria-labelledby="pf-sm-h">
        <h2 id="pf-sm-h" className={title}>{t("Your")} <span className="it">{t("details")}</span></h2>
        <p className={note}>{t("Everything you have entered, in one place. Updates as you type.")}</p>
        <table className="w-full border-collapse text-[13px]"><tbody>
          {rows.map(([k, val], i) => <tr key={k} className={i ? "border-t border-dashed border-border" : ""}><th scope="row" className="w-[38%] py-2.5 pe-3 pt-[11px] text-start align-top text-[10.5px] font-extrabold uppercase tracking-[.1em] text-muted-foreground">{t(k)}</th><td className="py-2.5 align-top font-semibold [overflow-wrap:anywhere]">{val}</td></tr>)}
        </tbody></table>
      </section>

      <section className={panel} aria-labelledby="pf-cp-h">
        <h2 id="pf-cp-h" className={title}>{t("Profile")} <span className="it">{t("strength")}</span></h2>
        <div className="mb-1 mt-3 flex items-center gap-4"><div className="font-display text-5xl leading-none tracking-[-.03em] tabular-nums">{pct}<small className="ms-0.5 text-[.4em] text-gold">%</small></div><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden><i className="block h-full rounded-full bg-gradient-gold transition-[width] duration-700" style={{ width: `${pct}%` }} /></div></div>
        <ul className="mt-2.5 grid gap-0.5">
          {checks.map(([label, ok, to]) => (
            <li key={label} className={`flex items-center gap-2.5 border-b border-dashed border-border py-2 text-[13px] last:border-0 ${ok ? "text-muted-foreground" : ""}`}>
              <i className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] ${ok ? "border-emerald-300 bg-emerald-300 after:h-2 after:w-1 after:-translate-y-px after:rotate-45 after:border-[#0a0e1b] after:content-[''] after:[border-style:solid] after:[border-width:0_2px_2px_0]" : "border-border"}`} />
              <span>{t(label)}</span>
              {!ok && <a href={to} onClick={(e) => { e.preventDefault(); go(to); }} className="ms-auto text-xs font-bold text-gold underline underline-offset-[3px]">{t("Add")}</a>}
            </li>
          ))}
        </ul>
      </section>

      <section className={panel} aria-labelledby="pf-jp-h">
        <h2 id="pf-jp-h" className={title}>{t("Job")} <span className="it">{t("progress")}</span></h2>
        <p className={note}>{t("Live from your Inbox, Quote requests, Bookings and Invoice pages.")}</p>
        <div className={sub.replace("mt-3.5", "mt-0")}>{t("Invoices")}</div>
        <div className="relative mx-auto my-3 mb-1.5 h-44 w-44">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" role="img" aria-label={t("Invoices by payment status")}><circle cx="18" cy="18" r="15.9155" fill="none" strokeWidth="4.2" stroke="rgba(246,239,226,.07)" />{arcs}</svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center"><b className="font-display text-[42px] font-normal leading-none tracking-[-.03em]">{tot}</b><small className="mt-0.5 text-[11px] text-muted-foreground">{t(tot === 1 ? "invoice" : "invoices")}</small></div>
        </div>
        <ul>
          {S.map((s, i) => <li key={s.k} className={`grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2.5 py-2 text-[13px] ${i ? "border-t border-dashed border-border" : ""}`}><i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.c }} /><span>{t(`Invoice ${s.l.toLowerCase()}`)}</span><em className="text-end font-extrabold not-italic tabular-nums">{s.n}<small className="block text-[11.5px] font-medium text-muted-foreground">AED {n0(s.amt)}</small></em></li>)}
        </ul>
        <div className={`${sub} mt-5`}>{t("Pipeline")}</div>
        <div className="mt-3 grid gap-3.5">
          {R.map(([l, s, n, c]) => <div key={l}><div className="flex items-baseline justify-between gap-2 text-[13px]"><span>{t(l)}<small className="block text-[11.5px] text-muted-foreground">{s}</small></span><b className="tabular-nums">{n}</b></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/[.07]"><i className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${(n / mx) * 100}%`, background: c }} /></div></div>)}
        </div>
        <p className="mt-4 rounded-xl bg-foreground/[.04] px-3 py-2.5 text-[12.5px] text-muted-foreground">{inquiries ? <><b className="text-foreground">{Math.round((completed / inquiries) * 100)}%</b> {t("of your inquiries ended as a completed job.")}</> : t("No inquiries yet.")}</p>
      </section>

      <section className={panel} aria-labelledby="pf-cf-h">
        <h2 id="pf-cf-h" className={title}>{t("Cash")} <span className="it">{t("flow")}</span></h2>
        <p className={note}>{t("Pulled from your Wallet and AI credits. Amounts are after your plan fee, excluding VAT.")}</p>
        <table className="w-full border-collapse text-[13px]"><tbody>
          {cash.map(([k, val, s], i) => <tr key={k} className={`${i ? "border-t border-dashed border-border" : ""} ${k === "Balance" ? "bg-gold/[.07]" : ""}`}><th scope="row" className="w-[38%] py-2.5 pe-3 text-start align-top text-[10.5px] font-extrabold uppercase tracking-[.1em] text-muted-foreground">{t(k)}</th><td className="py-2.5 align-top font-semibold" dir="ltr">{val}{s && <small className="block text-[11.5px] font-medium text-muted-foreground">{s}</small>}</td></tr>)}
        </tbody></table>
        <div className="mt-3.5 flex h-2.5 gap-[3px] overflow-hidden rounded-full bg-foreground/[.06]" role="img" aria-label={t("Revenue split between withdrawn and balance")}>{revenue > 0 && <><i className="block h-full rounded-full bg-[#e8b04a]" style={{ flexGrow: share, minWidth: share ? 6 : 0 }} /><i className="block h-full rounded-full bg-[#7bd88f]" style={{ flexGrow: 100 - share }} /></>}</div>
        <p className="mt-3 rounded-xl bg-foreground/[.04] px-3 py-2.5 text-[12.5px] text-muted-foreground">{t("Balance = Total revenue - Withdraw")}</p>
      </section>
    </div>
  );
}
