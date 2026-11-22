import { AdminContractTemplates } from "@/components/admin/AdminMarketplace";
import { ContractTemplateLibrary, TemplatePicker, useContractTemplates } from "./ContractTemplates";
import { ContractPreviewDialog, type ContractDoc } from "./ContractPreview";
import { parseStoredTerms } from "@/lib/contract-terms";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, DollarSign, Eye, EyeOff, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CONTRACT_TERMS } from "@/lib/booking-rules";
import { invoiceMoney } from "@/lib/invoice";
import { useI18n } from "@/lib/i18n";
import { StudioHeading } from "./StudioPage";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { NOT_DELETABLE, bookingDeletable, useHideRows, useSelection } from "./BulkSelect";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

type ContractRow = { artists?: { stage_name: string } | null; paid_amount: number | string; escrow_status: string | null; status: string; contract_template_id: string | null; id: string; client_name: string; package_title: string | null; event_date: string | null; total: number | string; contract_accepted_at: string | null; invoice_no: string | null };
const fmtD = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const kh = "whitespace-nowrap border-b border-border bg-card px-3.5 py-3 text-[11px] font-extrabold uppercase tracking-[.1em] text-muted-foreground";
const kc = "whitespace-nowrap border-b border-border px-3.5 py-3.5 align-middle";

/** Hide is a private display preference, not booking deletion or a financial mutation. */
function useContractVisibility(storageKey: string | null) {
  const { t } = useI18n();
  const [stored, setStored] = useState<{ key: string | null; ids: string[] }>({ key: null, ids: [] });
  useEffect(() => {
    if (!storageKey) return;
    const load = () => {
      try {
        const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
        setStored({ key: storageKey, ids: Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [] });
      } catch { setStored({ key: storageKey, ids: [] }); }
    };
    load();
    const sync = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) load(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey]);
  const ids = stored.key === storageKey ? stored.ids : [];
  const update = (values: string[], hidden: boolean) => {
    if (!storageKey || stored.key !== storageKey) return false;
    const next = hidden ? Array.from(new Set([...ids, ...values])) : ids.filter((id) => !values.includes(id));
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setStored({ key: storageKey, ids: next }); return true; }
    catch { toast.error(t("Could not save list visibility")); return false; }
  };
  return { ids, ready: !!storageKey && stored.key === storageKey, update };
}

/** Shared artist/admin table; protected deletion remains an artist-team action. */
function BookingContractsPanel({ artistId, rows, isPending, error, onView, storageKey, lockedFor = () => false }: {
  artistId?: string; rows: ContractRow[]; isPending: boolean; error: unknown; onView: (id: string) => void;
  storageKey: string | null; lockedFor?: (row: ContractRow) => boolean;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "awaiting" | "accepted">("all");
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const visibility = useContractVisibility(storageKey);
  const selection = useSelection();
  const deletion = useHideRows("soft_delete_bookings", [["contracts"], ["artist-bookings", artistId], ["cal-jobs", artistId]], selection.clear);
  const hidden = new Set(visibility.ids);
  const hiddenCount = rows.filter((row) => hidden.has(row.id)).length;
  const visible = rows.filter((row) => showHidden || !hidden.has(row.id));
  const accepted = visible.filter((row) => row.contract_accepted_at).length;
  const counts = { all: visible.length, awaiting: visible.length - accepted, accepted };
  const needle = q.trim().toLowerCase();
  const list = visible.filter((row) => (tab === "all" || (tab === "accepted") === !!row.contract_accepted_at) && (!needle || `${row.package_title ?? ""} ${row.client_name} ${row.artists?.stage_name ?? ""}`.toLowerCase().includes(needle)));
  const pages = Math.max(1, Math.ceil(list.length / size));
  const cur = Math.min(page, pages - 1);
  const shown = list.slice(cur * size, cur * size + size);
  const picked = list.filter((row) => selection.has(row.id));
  const deletable = artistId ? picked.filter(bookingDeletable).map((row) => row.id) : [];
  const hideRows = (ids: string[], hide: boolean) => { if (visibility.update(ids, hide)) { selection.clear(); setPage(0); } };
  const deleteRows = async (ids: string[]) => { if (ids.length > 200) { toast.error(t("Select up to 200 records at a time")); return; } await deletion.run(ids, "bookings"); };
  const allChecked = shown.length > 0 && shown.every((row) => selection.has(row.id));
  const partlyChecked = !allChecked && shown.some((row) => selection.has(row.id));
  return <section className="dmr-panel dmr-q-panel dmr-c-12" aria-label={t("Booking contracts")}>
    <div className="dmr-q-tools">
      <div className="me-auto"><h2 className="font-display text-[28px] leading-none">{t("Booking contracts")}</h2><small className="text-xs text-muted-foreground">{t("One per booking")}</small></div>
      <div className="flex min-w-0 flex-1 basis-72 items-center gap-2"><label className="relative flex min-w-0 flex-1 items-center"><Search className="pointer-events-none absolute start-3.5 h-4 w-4 text-muted-foreground" aria-hidden /><span className="sr-only">{t("Search contracts")}</span><Input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); selection.clear(); }} placeholder={t("Search booking or client")} className="h-10 w-full rounded-full ps-10" /></label>
        <Button variant="outline" className="shrink-0 rounded-full" aria-pressed={showHidden} onClick={() => { setShowHidden(!showHidden); setPage(0); selection.clear(); }} title={t(showHidden ? "Hide hidden contracts" : "Show hidden contracts")}>{showHidden ? <EyeOff /> : <Eye />}{t(showHidden ? "Hide" : "Show")} <span>{hiddenCount}</span></Button>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t("Filter by contract status")}>{([["all", "All contracts"], ["awaiting", "Awaiting"], ["accepted", "Accepted"]] as const).map(([key, label]) => <Button key={key} size="sm" variant={tab === key ? "default" : "ghost"} className="rounded-full" aria-pressed={tab === key} onClick={() => { setTab(key); setPage(0); selection.clear(); }}>{t(label)} <span className="opacity-60">{counts[key]}</span></Button>)}</div>
    </div>
    {picked.length > 0 && <div role="region" aria-label={t("Selected contracts")} className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 text-sm"><b>{picked.length} {t("selected")}</b><Button variant="outline" size="icon" title={t("Hide selected contracts")} aria-label={t("Hide selected contracts")} disabled={!visibility.ready} onClick={() => hideRows(picked.map((row) => row.id), true)}><EyeOff /></Button>{picked.some((row) => hidden.has(row.id)) && <Button variant="outline" size="icon" title={t("Show selected contracts")} aria-label={t("Show selected contracts")} disabled={!visibility.ready} onClick={() => hideRows(picked.map((row) => row.id), false)}><Eye /></Button>}<Button variant="outline" size="icon" title={deletable.length ? `${t("Delete")} ${deletable.length}` : t(NOT_DELETABLE)} aria-label={t("Delete selected contracts")} disabled={deletion.busy || !deletable.length} onClick={() => void deleteRows(deletable)}><Trash2 /></Button><Button size="sm" variant="ghost" onClick={selection.clear}>{t("Clear")}</Button></div>}
    {error ? <p role="alert" className="p-5 text-destructive">{t("Could not load contracts.")}</p> : <div className="min-w-0 overflow-x-auto"><table className="w-full min-w-[1050px] border-separate border-spacing-0 text-[13.5px]">
      <thead><tr><th scope="col" className={`${kh} w-12`}><Checkbox aria-label={t("Select all contracts on this page")} checked={allChecked ? true : partlyChecked ? "indeterminate" : false} disabled={!shown.length} onCheckedChange={(on) => selection.toggleAll(shown.map((row) => row.id), on === true)} /></th>{["Booking", ...(!artistId ? ["Artist"] : []), "Client", "Date", "Total", "Contract", "Accepted at", ...(artistId ? ["Use contract"] : []), "Actions"].map((label) => <th key={label} scope="col" className={`${kh} ${label === "Total" ? "text-end" : "text-start"}`}>{t(label)}</th>)}</tr></thead>
      <tbody>{!shown.length && <tr><td colSpan={10} className="p-10 text-center text-muted-foreground"><b className="block font-display text-2xl">{t(isPending ? "Loading…" : "No contracts found")}</b></td></tr>}{shown.map((row) => <tr key={row.id} className={hidden.has(row.id) ? "bg-muted/30" : "hover:bg-muted/20"}>
        <td className={kc}><Checkbox aria-label={`${t("Select")} ${row.client_name}`} checked={selection.has(row.id)} onCheckedChange={(on) => selection.toggle(row.id, on === true)} /></td><td className={kc}><b>{row.package_title ?? row.invoice_no ?? row.id.slice(0, 8)}</b>{hidden.has(row.id) && <span className="ms-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><EyeOff className="size-3" />{t("Hidden")}</span>}</td>{!artistId && <td className={kc}>{row.artists?.stage_name ?? "—"}</td>}<td className={kc}>{row.client_name}</td><td className={kc}>{fmtD(row.event_date)}</td><td className={`${kc} text-end`} dir="ltr"><b>{invoiceMoney(Number(row.total))}</b></td><td className={kc}><span className={`inline-flex min-w-[120px] justify-center rounded-full px-3 py-1 text-xs font-bold ${row.contract_accepted_at ? "bg-success/15 text-success" : "bg-gradient-gold text-gold-foreground"}`}>{t(row.contract_accepted_at ? "Accepted" : "Awaiting acceptance")}</span></td><td className={kc}>{row.contract_accepted_at ? new Date(row.contract_accepted_at).toLocaleString("en-GB") : t("Not yet")}</td>{artistId && <td className={kc}><TemplatePicker artistId={artistId} bookingId={row.id} templateId={row.contract_template_id} locked={!!row.contract_accepted_at} /></td>}
        <td className={kc}><div className="flex items-center gap-1"><Button size="icon" variant="ghost" title={t("Contract preview")} aria-label={`${t("View contract for")} ${row.client_name}`} onClick={() => onView(row.id)}>{lockedFor(row) ? <DollarSign /> : <Eye />}</Button><Button size="icon" variant="ghost" title={t(hidden.has(row.id) ? "Show contract" : "Hide contract")} aria-label={`${t(hidden.has(row.id) ? "Show" : "Hide")} ${row.client_name}`} disabled={!visibility.ready} onClick={() => hideRows([row.id], !hidden.has(row.id))}>{hidden.has(row.id) ? <Eye /> : <EyeOff />}</Button><Button size="icon" variant="ghost" title={t(artistId && bookingDeletable(row) ? "Delete booking contract" : NOT_DELETABLE)} aria-label={`${t("Delete")} ${row.client_name}`} disabled={deletion.busy || !artistId || !bookingDeletable(row)} onClick={() => void deleteRows([row.id])}><Trash2 /></Button></div></td>
      </tr>)}</tbody>
    </table></div>}
    <div className="dmr-q-foot flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs text-muted-foreground">{t("Rows per page")}<select aria-label={t("Rows per page")} value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className="h-8 rounded-md border border-border bg-card px-2 text-foreground">{[1, 5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}</select></label><span className="text-xs text-muted-foreground">{list.length ? `${cur * size + 1}–${Math.min(list.length, cur * size + size)}` : "0"} {t("of")} {list.length}</span><div className="flex items-center gap-3"><Button size="icon" variant="outline" title={t("Previous page")} aria-label={t("Previous page")} disabled={cur === 0} onClick={() => setPage(cur - 1)}><ArrowLeft /></Button><span className="text-xs text-muted-foreground">{cur + 1} / {pages}</span><Button size="icon" variant="outline" title={t("Next page")} aria-label={t("Next page")} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}><ArrowRight /></Button></div></div>
  </section>;
}

function ArtistContractsPanel(props: { artistId: string; rows: ContractRow[]; isPending: boolean; error: unknown; onView: (id: string) => void; storageKey: string | null }) {
  const { templates, rank, myRank } = useContractTemplates(props.artistId);
  return <BookingContractsPanel {...props} lockedFor={(row) => { const template = templates.find((x) => x.id === row.contract_template_id); return !!template && template.artist_id === null && (rank.get(template.tier) ?? 99) > myRank; }} />;
}

type ContractFull = ContractRow & { artists?: { stage_name: string } | null; start_time?: string | null; end_time?: string | null; job_detail?: string | null; notes?: string | null };

/** Artist popup for a booking contract: the cream sheet with Print / PDF, or a blurred sheet with Buy contract when the template is outside the plan. */
function ArtistContractDialog({ artistId, contract, onClose }: { artistId: string; contract: ContractFull | undefined; onClose: () => void }) {
  const { t } = useI18n();
  const { templates, plan, rank, myRank } = useContractTemplates(artistId);
  const tpl = templates.find((x) => x.id === contract?.contract_template_id);
  const locked = !!tpl && tpl.artist_id === null && (rank.get(tpl.tier) ?? 99) > myRank;
  const terms = useQuery({ queryKey: ["contract-terms", contract?.id], enabled: !!contract && !locked, queryFn: async () => { if (!contract) return null; const r = await supabase.rpc("booking_contract_terms", { _booking: contract.id }); return r.error ? null : parseStoredTerms(r.data); } });
  const tierName = plan.data?.tiers.find((x) => x.code === tpl?.tier)?.name;
  const doc: ContractDoc | null = contract ? {
    number: `DM-C-${(contract.event_date ?? "").replace(/-/g, "")}-${contract.id.slice(0, 6).toUpperCase()}`,
    templateName: tpl?.name ?? t("Standard terms"),
    stamp: contract.contract_accepted_at ? { word: "ACCEPTED", sub: new Date(contract.contract_accepted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toUpperCase(), tone: "accepted" } : { word: "AWAITING", sub: "HIRER ACCEPTANCE", tone: "awaiting" },
    intro: t("This agreement is made through the Dealmaker platform between the parties below."),
    parties: [["Artist", contract.artists?.stage_name], ["Client", contract.client_name], ["Service", contract.package_title], ["Date", contract.event_date], ["Time", `${contract.start_time?.slice(0, 5) ?? "—"} – ${contract.end_time?.slice(0, 5) ?? "—"}`], ["Total", invoiceMoney(Number(contract.total))], ["Booking status", contract.status]],
    jobDetail: contract.job_detail ?? contract.notes,
    clauses: terms.data && terms.data.clauses.length > 0 ? terms.data.clauses : CONTRACT_TERMS.map((term) => ({ title: "", body: t(term) })),
    rider: terms.data?.rider ?? null,
    footer: contract.contract_accepted_at ? `${t("Accepted at")} ${new Date(contract.contract_accepted_at).toLocaleString("en-GB")}` : t("Awaiting acceptance"),
  } : null;
  return <ContractPreviewDialog doc={doc} title={`${t("Booking contract")} ${t("· Dealmaker")}`} locked={locked} {...(tierName ? { planName: tierName } : {})} artistId={artistId} onClose={onClose} />;
}

export function ContractsTable({ artistId }: { artistId?: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const storageKey = user ? `dm-contracts-hidden:${user.id}:${artistId ?? "admin"}` : null;
  const [selected,setSelected] = useState<string | null>(null);
  const { data = [], isPending, error } = useQuery({queryKey:["contracts",artistId],queryFn:async()=>{
    let query = supabase.from("bookings").select("id, client_name, package_title, event_date, start_time, end_time, job_detail, notes, total, paid_amount, escrow_status, contract_accepted_at, contract_template_id, status, invoice_no, artists(stage_name)").in("status",["quoted","confirmed","completed","cancelled","disputed"]).order("created_at",{ascending:false});
    if(artistId)query=query.eq("artist_id",artistId).is("deleted_at",null);
    const result=await query; if(result.error)throw result.error; return result.data ?? [];
  }});
  const contract=data.find(row=>row.id===selected);
  /** The admin overview shows the standard terms; stored template terms are read only in the artist popup. */
  const adminDoc: ContractDoc | null = contract ? {
    number: `DM-C-${(contract.event_date ?? "").replace(/-/g, "")}-${contract.id.slice(0, 6).toUpperCase()}`,
    templateName: t("Standard terms"),
    stamp: contract.contract_accepted_at ? { word: "ACCEPTED", sub: new Date(contract.contract_accepted_at).toLocaleDateString("en-GB"), tone: "accepted" } : { word: "AWAITING", sub: "HIRER ACCEPTANCE", tone: "awaiting" },
    parties: [["Artist", contract.artists?.stage_name], ["Client", contract.client_name], ["Service", contract.package_title], ["Date", contract.event_date], ["Time", `${contract.start_time?.slice(0, 5) ?? "—"} – ${contract.end_time?.slice(0, 5) ?? "—"}`], ["Total", invoiceMoney(Number(contract.total))], ["Booking status", contract.status]],
    jobDetail: contract.job_detail ?? contract.notes,
    clauses: CONTRACT_TERMS.map((term) => ({ title: "", body: t(term) })),
    footer: contract.contract_accepted_at ? `${t("Accepted at")} ${new Date(contract.contract_accepted_at).toLocaleString("en-GB")}` : t("Awaiting acceptance"),
  } : null;
  return <section className="dmr-wrap dmr-kpage"><StudioHeading title="Contr" accent="acts"><div className="dmr-q-stats"><div className="dmr-qs"><small>{t("Awaiting")}</small><b>{data.filter(row=>!row.contract_accepted_at).length}</b></div><div className="dmr-qs"><small>{t("Accepted")}</small><b>{data.filter(row=>row.contract_accepted_at).length}</b></div></div></StudioHeading>{artistId ? <ContractTemplateLibrary artistId={artistId} bookingTemplates={data.map((row) => row.contract_template_id)} /> : <div className="dmr-panel dmr-c-12"><h2 className="mb-5 font-display text-[28px]">{t("Contract")} <span className="it">{t("templates")}</span></h2><AdminContractTemplates cards bookingTemplates={data.map((row) => row.contract_template_id)} /></div>}
    {artistId ? <ArtistContractsPanel key={storageKey} artistId={artistId} rows={data as unknown as ContractRow[]} isPending={isPending} error={error} onView={setSelected} storageKey={storageKey} /> : <BookingContractsPanel key={storageKey} rows={data as unknown as ContractRow[]} isPending={isPending} error={error} onView={setSelected} storageKey={storageKey} />}
    {artistId ? <ArtistContractDialog artistId={artistId} contract={contract as unknown as ContractFull | undefined} onClose={() => setSelected(null)} /> : <ContractPreviewDialog doc={adminDoc} title={`${t("Booking contract")} ${t("· Dealmaker")}`} onClose={() => setSelected(null)} />}
  </section>;
}