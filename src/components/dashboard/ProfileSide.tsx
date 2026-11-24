import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { initials } from "@/lib/format";
import { useArtistPlan } from "./PromptLibrary";
import { toInvoiceRows, useInvoiceQuery } from "./InvoiceRecords";
import { useProfilePhoto } from "@/hooks/use-profile-photo";

type Live = {
  stage_name?: string | null; tagline?: string | null; bio?: string | null; base_price?: number | null; travel_radius_km?: number | null;
  languages?: string[] | null; skills?: string[] | null; body?: unknown;
};
export type ProfileNames = { category: string; speciality: string; emirate: string; area: string };

const aed = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n0 = (n: number) => Math.round(n).toLocaleString("en-US");

/** The panels beside the profile form: how clients see you, your details, profile strength, job progress and cash flow. Updates as you type. */
export function ProfileSide({ artistId, v, photoPath, names }: { artistId: string; v: Live; photoPath: string | null; names: ProfileNames }) {
  const { t } = useI18n();
  const { data: photoUrl } = useProfilePhoto(artistId, photoPath);
  const body = (v.body && typeof v.body === "object" && !Array.isArray(v.body) ? v.body : {}) as Record<string, unknown>;
  const works = useQuery({ queryKey: ["portfolio", artistId, "summary"], queryFn: async () => (await supabase.from("artist_portfolio").select("id").eq("artist_id", artistId)).data ?? [] });
  const clients = useQuery({ queryKey: ["clients", artistId, "summary"], queryFn: async () => (await supabase.from("artist_clients").select("id, is_public").eq("artist_id", artistId)).data ?? [] });
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
    ["A speciality", !!names.speciality, "#pf-sp"], ["Three or more skills", (v.skills ?? []).length >= 3, "#pf-sk"], ["Starting price and location", !!v.base_price && !!names.area, "#pf-price"],
    ["Languages", (v.languages ?? []).length > 0, "#pf-lg"], ["One work in your portfolio", (works.data?.length ?? 0) > 0, "#pf-po-s"], ["One client", (clients.data?.length ?? 0) > 0, "#pf-cl-s"],
  ];
  if (isModel) checks.splice(6, 0, ["Height, weight and hair color", !!(body["height_cm"] && body["weight_kg"] && body["hair"]), "#body-height_cm"]);
  const done = checks.filter((c) => c[1]).length;
  const pct = Math.round((done / checks.length) * 100);
  const go = (sel: string) => { const el = document.querySelector<HTMLElement>(sel); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); window.setTimeout(() => el.focus?.({ preventScroll: true }), 350); } };

  const no = <span className="dmr-no">{t("Not set")}</span>;
  const optional = <span style={{ color: "var(--studio-mute-2)" }}>{t("Optional")}</span>;
  const tags = (a: string[]) => a.length ? <div className="dmr-tg">{a.map((x) => <span key={x}>{x}</span>)}</div> : no;
  const rows: [string, React.ReactNode][] = [
    ["Stage name", nameOk ? v.stage_name : no], ["Tagline", (v.tagline ?? "").trim() ? v.tagline : no], ["Photo", photoPath ? <span className="dmr-ok">{t("Uploaded")}</span> : no],
    ["Categories", names.category ? tags([names.category]) : no], ["Specialities", names.speciality ? tags([names.speciality]) : no], ["Skills", tags(v.skills ?? [])],
    ["Emirate", names.emirate || no], ["Base area", names.area || no], ["Starting price", v.base_price ? `AED ${n0(Number(v.base_price))}` : no], ["Travel radius", v.travel_radius_km != null ? `${v.travel_radius_km} km` : no], ["Languages", tags(v.languages ?? [])],
    ["Height and weight", body["height_cm"] || body["weight_kg"] ? [body["height_cm"] && `${body["height_cm"]} cm`, body["weight_kg"] && `${body["weight_kg"]} kg`].filter(Boolean).join(" · ") : isModel ? no : optional],
    ["Hair and eyes", body["hair"] || body["eyes"] ? [body["hair"], body["eyes"] && `${body["eyes"]} ${t("eyes")}`].filter(Boolean).join(" · ") : isModel ? no : optional],
    ["Bio", bioLen >= 150 ? <span className="dmr-ok">{bioLen} {t("characters")}</span> : <span className="dmr-no">{bioLen} {t("of 150 characters")}</span>],
    ["Portfolio", `${works.data?.length ?? 0} ${t("works")}`], ["Clients", `${clients.data?.length ?? 0} (${(clients.data ?? []).filter((c) => c.is_public).length} ${t("public")})`], ["Plan", plan.data?.mine?.name ?? "-"],
  ];

  const S = [["paid", "Paid", "#7bd88f"], ["partial", "Partial", "#e8b04a"], ["unpaid", "Unpaid", "#e58a8a"]].map(([k, l, c]) => {
    const list = invoices.filter((i) => (i.status === "paid" ? "paid" : i.paid > 0 ? "partial" : "unpaid") === k);
    return { k: k!, l: l!, c: c!, n: list.length, amt: list.reduce((a, i) => a + Number(i.total), 0) };
  });
  const tot = invoices.length;
  let off = 0;
  const arcs = tot ? S.filter((s) => s.n).map((s, _i, all) => { const p = (s.n / tot) * 100, d = Math.max(0, p - (all.length > 1 ? 1.2 : 0)); const el = <circle key={s.k} cx="18" cy="18" r="15.9155" stroke={s.c} strokeDasharray={`${d.toFixed(2)} ${(100 - d).toFixed(2)}`} strokeDashoffset={(-off).toFixed(2)} />; off += p; return el; }) : null;
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
  const h2 = { fontSize: 22 } as const;
  const noteStyle = { margin: "6px 0 10px" } as const;

  return (
    <div className="dmr-w-side">
      <section className="dmr-panel" aria-labelledby="pf-pv-h">
        <h2 className="dmr-serif" id="pf-pv-h" style={h2}>{t("How clients")} <span className="it">{t("see you")}</span></h2>
        <div className="dmr-pf-pv">
          <div className="dmr-pf-av">{photoUrl ? <img src={photoUrl} alt={v.stage_name || t("Profile photo")} /> : initials(v.stage_name || "?")}</div>
          <h3>{v.stage_name || t("Your name")}</h3>
          <p>{v.tagline || t("Your tagline")}</p>
          <div className="dmr-tg">{names.speciality || names.category ? <span>{names.speciality || names.category}</span> : <span style={{ color: "var(--studio-mute-2)" }}>{t("Category")}</span>}</div>
          <div className="dmr-fr">{t("From")} <b>AED {n0(Number(v.base_price ?? 0))}</b> · {[names.area, names.emirate].filter(Boolean).join(", ")}</div>
        </div>
      </section>

      <section className="dmr-panel" aria-labelledby="pf-sm-h">
        <h2 className="dmr-serif" id="pf-sm-h" style={h2}>{t("Your")} <span className="it">{t("details")}</span></h2>
        <p className="dmr-cr-note" style={noteStyle}>{t("Everything you have entered, in one place. Updates as you type.")}</p>
        <table className="dmr-pf-sm"><tbody>
          {rows.map(([k, val]) => <tr key={k}><th scope="row">{t(k)}</th><td>{val}</td></tr>)}
        </tbody></table>
      </section>

      <section className="dmr-panel" aria-labelledby="pf-cp-h">
        <h2 className="dmr-serif" id="pf-cp-h" style={h2}>{t("Profile")} <span className="it">{t("strength")}</span></h2>
        <div className="dmr-pf-ring"><div className="dmr-pct">{pct}<small>%</small></div><div className="dmr-pf-bar" style={{ flex: 1, margin: 0, height: 6 }} aria-hidden="true"><i className="ok" style={{ width: `${pct}%` }} /></div></div>
        <ul className="dmr-pf-chk">
          {checks.map(([label, ok, to]) => (
            <li key={label} className={ok ? "ok" : ""}><i /><span>{t(label)}</span>{!ok && <a href={to} onClick={(e) => { e.preventDefault(); go(to); }}>{t("Add")}</a>}</li>
          ))}
        </ul>
      </section>

      <section className="dmr-panel" aria-labelledby="pf-jp-h">
        <h2 className="dmr-serif" id="pf-jp-h" style={h2}>{t("Job")} <span className="it">{t("progress")}</span></h2>
        <p className="dmr-cr-note" style={{ margin: "6px 0 4px" }}>{t("Live from your Inbox, Quote requests, Bookings and Invoice pages.")}</p>
        <div className="dmr-pf-jh">{t("Invoices")}</div>
        <div className="dmr-pf-do">
          <svg viewBox="0 0 36 36" role="img" aria-label={t("Invoices by payment status")}><circle cx="18" cy="18" r="15.9155" stroke="rgba(246,239,226,.07)" />{arcs}</svg>
          <div className="dmr-mid"><b>{tot}</b><small>{t(tot === 1 ? "invoice" : "invoices")}</small></div>
        </div>
        <ul className="dmr-pf-dl">
          {S.map((s) => <li key={s.k}><i style={{ background: s.c }} /><span>{t(`Invoice ${s.l.toLowerCase()}`)}</span><em>{s.n}<small>AED {n0(s.amt)}</small></em></li>)}
        </ul>
        <div className="dmr-pf-jh" style={{ marginTop: 20 }}>{t("Pipeline")}</div>
        <div className="dmr-pf-hb">
          {R.map(([l, s, n, c]) => <div key={l} className="dmr-pf-hr"><div className="dmr-ht"><span>{t(l)}<small>{s}</small></span><b>{n}</b></div><div className="dmr-ln"><i style={{ background: c, width: `${(n / mx) * 100}%` }} /></div></div>)}
        </div>
        <p className="dmr-pf-cv">{inquiries ? <><b>{Math.round((completed / inquiries) * 100)}%</b> {t("of your inquiries ended as a completed job.")}</> : t("No inquiries yet.")}</p>
      </section>

      <section className="dmr-panel" aria-labelledby="pf-cf-h">
        <h2 className="dmr-serif" id="pf-cf-h" style={h2}>{t("Cash")} <span className="it">{t("flow")}</span></h2>
        <p className="dmr-cr-note" style={noteStyle}>{t("Pulled from your Wallet and AI credits. Amounts are after your plan fee, excluding VAT.")}</p>
        <table className="dmr-pf-sm dmr-pf-cf"><tbody>
          {cash.map(([k, val, s]) => <tr key={k} className={k === "Balance" ? "hl" : ""}><th scope="row">{t(k)}</th><td dir="ltr">{val}{s && <small>{s}</small>}</td></tr>)}
        </tbody></table>
        <div className="dmr-pf-sp" role="img" aria-label={t("Revenue split between withdrawn and balance")}>{revenue > 0 && <><i style={{ flexGrow: share, background: "#e8b04a", minWidth: share ? 6 : 0 }} /><i style={{ flexGrow: 100 - share, background: "#7bd88f" }} /></>}</div>
        <p className="dmr-pf-cv" style={{ marginTop: 12 }}>{t("Balance = Total revenue - Withdraw")}</p>
      </section>
    </div>
  );
}
