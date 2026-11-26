/** Links that open a search already filled in with the traveller's request. Built here, never written by the AI. */
export type LinkRequest = {
  kind: "flight" | "hotel" | "hospital";
  from: string | null; to: string | null; fromCode: string | null; toCode: string | null;
  depart: string | null; returnDate: string | null; direct: boolean | null; airlines: string[] | null;
  city: string | null; country: string | null; checkIn: string | null; checkOut: string | null; guests: number | null;
  keywords: string | null;
};
export type Link = { title: string; url: string };

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const code = (v: string | null) => (v && /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : null);
const q = (parts: (string | null | false)[]) => encodeURIComponent(parts.filter(Boolean).join(" "));

export const LINK_TOOL = {
  type: "function" as const,
  strict: true,
  name: "travel_links",
  description: "Exact search links for the traveller's request: flights (one link per airline when airlines are given), hotels, or doctors and hospitals. Use these as the link of each result row. For two possible dates, call it once per date.",
  parameters: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["flight", "hotel", "hospital"] },
      from: { type: ["string", "null"] }, to: { type: ["string", "null"] },
      fromCode: { type: ["string", "null"], description: "IATA code of the departure airport or city" }, toCode: { type: ["string", "null"] },
      depart: { type: ["string", "null"], description: "YYYY-MM-DD" }, returnDate: { type: ["string", "null"] },
      direct: { type: ["boolean", "null"] }, airlines: { type: ["array", "null"], items: { type: "string" } },
      city: { type: ["string", "null"] }, country: { type: ["string", "null"] },
      checkIn: { type: ["string", "null"] }, checkOut: { type: ["string", "null"] }, guests: { type: ["integer", "null"] },
      keywords: { type: ["string", "null"], description: "Hotel type, or doctor speciality and gender" },
    },
    required: ["kind", "from", "to", "fromCode", "toCode", "depart", "returnDate", "direct", "airlines", "city", "country", "checkIn", "checkOut", "guests", "keywords"],
    additionalProperties: false,
  },
};

export function travelLinks(r: LinkRequest): Link[] {
  if (r.kind === "flight") {
    const from = clean(r.from) || code(r.fromCode), to = clean(r.to) || code(r.toCode);
    if (!from || !to) throw new Error("Say where the flight starts and ends.");
    const out = date(r.depart), back = date(r.returnDate);
    const google = (airline?: string): Link => ({
      title: `Google Flights: ${airline ? `${airline}, ` : ""}${from} to ${to}${out ? `, ${out}` : ""}`,
      url: `https://www.google.com/travel/flights?q=${q([r.direct && "Nonstop", "flights from", from, "to", to, out && `on ${out}`, back ? `returning ${back}` : "one way", !!airline && `with ${airline}`])}`,
    });
    const links = [google(), ...(r.airlines ?? []).map(clean).filter(Boolean).slice(0, 6).map(google)];
    const a = code(r.fromCode), b = code(r.toCode);
    if (a && b && out) {
      const short = (d: string) => d.slice(2).replace(/-/g, "");
      links.push(
        { title: `Skyscanner: ${a} to ${b}, ${out}`, url: `https://www.skyscanner.net/transport/flights/${a.toLowerCase()}/${b.toLowerCase()}/${short(out)}/${back ? `${short(back)}/` : ""}?adultsv2=1&preferdirects=${!!r.direct}&rtn=${back ? 1 : 0}` },
        { title: `Kayak: ${a} to ${b}, ${out}`, url: `https://www.kayak.com/flights/${a}-${b}/${out}${back ? `/${back}` : ""}?sort=bestflight_a${r.direct ? "&fs=stops%3D0" : ""}` },
      );
    }
    return links;
  }
  const place = [clean(r.city), clean(r.country)].filter(Boolean).join(", ");
  if (!place) throw new Error("Say which city to search.");
  if (r.kind === "hotel") {
    const params = new URLSearchParams({ ss: place, no_rooms: "1", group_adults: String(Math.min(30, Math.max(1, r.guests ?? 1))) });
    const checkIn = date(r.checkIn), checkOut = date(r.checkOut);
    if (checkIn && checkOut) { params.set("checkin", checkIn); params.set("checkout", checkOut); }
    return [
      { title: `Booking.com: stays in ${place}`, url: `https://www.booking.com/searchresults.html?${params}` },
      { title: `Google Hotels: ${place}`, url: `https://www.google.com/travel/search?q=${q([clean(r.keywords) || "hotels", "in", place])}` },
    ];
  }
  const what = [clean(r.keywords), "doctor hospital in", place];
  return [
    { title: `Google Maps: ${place}`, url: `https://www.google.com/maps/search/?api=1&query=${q(what)}` },
    { title: `Google search: ${place}`, url: `https://www.google.com/search?q=${q(what)}` },
  ];
}

/** Whether a message asks for the longer, multi-search answer. */
export const wantsDeepSearch = (text: string) => /^\s*(\/deep ?sea?r?ch\b|\/deepseach\b|find (flight|hotel|hospital)\b|research\b)/i.test(text);

const trailing = /[.,;:!?'"]+$/;
/** Every web address in a piece of text. */
export const addresses = (text: string) => (text.match(/https?:\/\/[^\s<>()\[\]"'\\]+/g) ?? []).map((u) => u.replace(trailing, ""));

export type Source = { title: string; url: string };
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const letters = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
/** The page a search found on the same website, or on the website a name refers to. */
function sourceFor(sources: Source[], url: string, label: string) {
  const site = host(url), name = letters(label);
  return sources.find((s) => site && (host(s.url) === site || letters(s.title) === letters(site)))
    ?? sources.find((s) => name.length >= 4 && [host(s.url), s.title].some((v) => letters(v.split(".")[0] ?? "") === name || letters(v).startsWith(name)));
}

/**
 * Makes every link in an answer lead somewhere real. An address that nothing returned is replaced by the page
 * the search found on that website; without one the words stay and the address goes. A source named in the
 * last column of a table without a link receives it.
 */
export function keepKnownLinks(reply: string, known: Iterable<string>, sources: Source[] = []) {
  const allowed = new Set([...known, ...sources.map((s) => s.url)].map((u) => u.replace(/\/$/, "")));
  const ok = (url: string) => allowed.has(url.replace(trailing, "").replace(/\/$/, ""));
  return reply
    .replace(/\[([^\]]*)\]\(\s*<?(https?:\/\/(?:[^()\s<>]|\([^()\s]*\))+)>?\s*\)/g, (whole, label: string, url: string) => {
      if (ok(url)) return whole;
      const found = sourceFor(sources, url, label);
      return found ? `[${label}](${found.url})` : label;
    })
    .replace(/(?<!\]\()<?\bhttps?:\/\/[^\s<>()\[\]"']+>?/g, (found) => {
      const url = found.replace(/^<|>$/g, "");
      return ok(url) ? found : sourceFor(sources, url, "")?.url ?? "";
    })
    .replace(/^(\|.*\|)([^|\n]+)\|[ \t]*$/gm, (row, start: string, cell: string) => {
      const name = cell.trim();
      const found = name && !name.includes("](") && !/^[-: ]+$/.test(name) ? sourceFor(sources, "", name) : undefined;
      return found ? `${start} [${name}](${found.url}) |` : row;
    });
}
