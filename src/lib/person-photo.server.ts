/** Looks a public figure up on Wikipedia. Only an article about a human with the asked name gives a photo. */
import { readSummary, type PersonPhoto } from "./person-photo";
import { withinLimits } from "./rate-limit.server";

async function read(url: string): Promise<unknown> {
  // Wikimedia asks automated readers to name themselves.
  const response = await fetch(url, { headers: { "User-Agent": "TalentAssistant/1.0", Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
  return response.ok ? response.json() : null;
}

export async function personPhoto(artistId: string, name: string): Promise<PersonPhoto | null> {
  const asked = name.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!asked) return null;
  if (!(await withinLimits([[`personphoto:${artistId}`, 40, "1 hour"]]))) throw new Error("The hourly photo limit is reached. Try again later.");
  for (const language of ["id", "en"]) {
    try {
      const search = (await read(`https://${language}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(asked)}`)) as { query?: { search?: { title: string }[] } } | null;
      for (const hit of search?.query?.search ?? []) {
        const summary = await read(`https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`);
        const found = summary ? readSummary(asked, summary as never) : null;
        if (!found) continue;
        // "Instance of: human" keeps places, bands and companies with the same name out.
        const claims = (await read(`https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&property=P31&entity=${found.item}`)) as { claims?: { P31?: { mainsnak?: { datavalue?: { value?: { id?: string } } } }[] } } | null;
        if (!claims?.claims?.P31?.some((c) => c.mainsnak?.datavalue?.value?.id === "Q5")) continue;
        return { name: found.name, photo: found.photo, page: found.page };
      }
    } catch (error) {
      console.error("Person photo unavailable", error instanceof Error ? error.message : "unknown");
    }
  }
  return null;
}
