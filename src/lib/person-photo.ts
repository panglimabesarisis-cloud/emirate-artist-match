/** The photo of a public figure, taken from their Wikipedia article. */
export type PersonPhoto = { name: string; photo: string; page: string };

export const PHOTO_TOOL = {
  type: "function" as const,
  strict: true,
  name: "person_photo",
  description: "The Wikipedia photo of a public figure the user asks about. The page shows it beside your answer. Use the person's full name; call it only for people known publicly.",
  parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
};

const words = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
/** An article counts only when its title carries every word of the name asked for, so no one else's face is shown. */
export function sameName(asked: string, title: string) {
  const wanted = words(asked), found = new Set(words(title));
  return wanted.length >= 1 && wanted.every((w) => found.has(w));
}

export const PHOTO_URL = /^https:\/\/(upload|thumb)\.wikimedia\.org\/[^\s<>"]+$/;
export const PAGE_URL = /^https:\/\/[a-z-]+\.wikipedia\.org\/wiki\/[^\s<>"]+$/;

type Summary = { type?: string; title?: string; thumbnail?: { source?: string }; content_urls?: { desktop?: { page?: string } }; wikibase_item?: string };
/** The photo in an article summary, or null when the article is not about exactly this name or has no picture. */
export function readSummary(asked: string, data: Summary): (PersonPhoto & { item: string }) | null {
  const photo = data.thumbnail?.source ?? "", page = data.content_urls?.desktop?.page ?? "", title = data.title ?? "";
  if (data.type !== "standard" || !sameName(asked, title) || !PHOTO_URL.test(photo) || !PAGE_URL.test(page) || !/^Q\d+$/.test(data.wikibase_item ?? "")) return null;
  return { name: title, photo, page, item: data.wikibase_item! };
}
