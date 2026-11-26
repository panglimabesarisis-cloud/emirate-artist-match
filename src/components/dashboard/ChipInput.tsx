import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

export type ChipOption = { n: string; g?: string };

/**
 * The tag box from dashboard.html: chips inside the field, a suggestion list under it,
 * comma or Enter to add, Backspace to remove the last chip, and a "n of max" line.
 * `strict` accepts only items from the list.
 */
export function ChipInput({ id, values, onChange, source, strict = false, max, noun, plural, placeholder, label, labelFor, className = "", onSuggest }: {
  id: string; values: string[]; onChange: (v: string[]) => void; source: ChipOption[]; strict?: boolean; max: number;
  noun: string; plural?: string; placeholder: string; label?: string; labelFor?: string; className?: string;
  /** In a strict list: asks for a name that is not in it. */
  onSuggest?: (name: string) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(-1);
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const pl = (n: number) => (n === 1 ? noun : plural ?? `${noun}s`);
  const flash = (m: string) => { setMsg(m); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setMsg(""), 4200); };
  const have = new Set(values.map((x) => x.toLowerCase()));
  const needle = q.trim().toLowerCase();
  const items = source.filter((x) => !have.has(x.n.toLowerCase()) && (!needle || x.n.toLowerCase().includes(needle))).slice(0, 9);
  const full = values.length >= max;
  // Offered only for a name that matches nothing exactly.
  const typed = q.trim().replace(/\s+/g, " ");
  const proposal = onSuggest && typed.length >= 2 && typed.length <= 40 && !have.has(typed.toLowerCase()) && !source.some((x) => x.n.toLowerCase() === typed.toLowerCase()) ? typed : "";
  const propose = (name: string) => { onSuggest?.(name); setQ(""); setOpen(false); setAct(-1); };

  const add = (raw: string) => {
    const v = raw.trim().replace(/\s+/g, " ");
    if (!v) return false;
    const hit = source.find((x) => x.n.toLowerCase() === v.toLowerCase());
    if (strict && !hit) {
      if (onSuggest && v.length >= 2 && v.length <= 40) { propose(v); return true; }
      flash(`"${v}" ${t("is not in our list. Choose one of the suggestions.")}`); return false;
    }
    const val = hit?.n ?? v;
    if (val.length > 40) { flash(t("Keep it under 40 characters.")); return false; }
    if (values.some((x) => x.toLowerCase() === val.toLowerCase())) { setQ(""); setOpen(false); return true; }
    if (values.length >= max) { flash(`${t("You can add up to")} ${max} ${pl(max)}.`); return false; }
    onChange([...values, val]); setQ(""); setOpen(false); setAct(-1);
    return true;
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setAct((a) => Math.min(items.length - (proposal ? 0 : 1), a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (act >= 0 && items[act]) add(items[act]!.n); else if (proposal && act === items.length) propose(proposal); else if (q.trim()) add(q); }
    else if (e.key === "Escape") { if (open) { e.stopPropagation(); setOpen(false); } }
    else if (e.key === "Backspace" && !q && values.length) onChange(values.slice(0, -1));
  };
  const onInput = (v: string) => {
    if (v.includes(",")) { const parts = v.split(","); const last = parts.pop() ?? ""; parts.forEach((p) => add(p)); setQ(last); } else setQ(v);
    setOpen(true); setAct(-1);
  };
  const listId = `${id}-l`;

  return (
    <div className={`dmr-qe-f dmr-full ${className}`}>
      {label && <label htmlFor={labelFor ?? id}>{label}</label>}
      <div className="dmr-pf-ci" id={`ci-${id}`}>
        <div className="dmr-pf-box" onClick={() => input.current?.focus()}>
          {values.map((v, i) => (
            <span key={v} className="dmr-pf-chip">{v}<button type="button" aria-label={`${t("Remove")} ${v}`} onClick={(e) => { e.stopPropagation(); onChange(values.filter((_, j) => j !== i)); input.current?.focus(); }}>×</button></span>
          ))}
          <input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={act >= 0 ? `${id}-o${act}` : undefined} autoComplete="off"
            value={q} placeholder={full ? "" : values.length ? t("Add another") : placeholder} onChange={(e) => onInput(e.target.value)} onFocus={() => setOpen(true)} onKeyDown={onKey}
            onBlur={() => window.setTimeout(() => { setOpen(false); if (q.trim() && !strict) add(q); else if (strict) setQ(""); }, 120)} />
        </div>
        {open && (
          <ul className="dmr-pf-sug" id={listId} role="listbox">
            {items.length ? items.map((x, i) => {
              const k = needle ? x.n.toLowerCase().indexOf(needle) : -1;
              return (
                <li key={x.n} id={`${id}-o${i}`} role="option" aria-selected={i === act} onMouseDown={(e) => { e.preventDefault(); add(x.n); }}>
                  <span>{k >= 0 ? <>{x.n.slice(0, k)}<mark>{x.n.slice(k, k + needle.length)}</mark>{x.n.slice(k + needle.length)}</> : x.n}</span>{x.g && <small>{x.g}</small>}
                </li>
              );
            }) : !proposal && <li className="dmr-none" role="presentation">{q ? (strict ? t("No match in our list") : `${t("Press comma or Enter to add")} "${q.trim()}"`) : t("No more suggestions")}</li>}
            {proposal && <li id={`${id}-o${items.length}`} role="option" aria-selected={act === items.length} onMouseDown={(e) => { e.preventDefault(); propose(proposal); }}><span>+ {t("Add")} <mark>{proposal}</mark></span><small>{t("needs approval")}</small></li>}
          </ul>
        )}
      </div>
      {msg && <span className="dmr-f-hint bad" role="alert">{msg}</span>}
      <div className={`dmr-pf-lim${full ? " full" : ""}`}><span><b>{values.length}</b> {t("of")} <b>{max}</b> {t(pl(max))}</span></div>
    </div>
  );
}
