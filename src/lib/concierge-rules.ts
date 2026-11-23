import { z } from "zod";
import { maskContacts } from "./masking";

export const conciergeInput = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(12),
});

export const CONCIERGE_PAGES = {
  browse: { label: "Browse talent", href: "/musicians" },
  booking: { label: "Booking with Dealmaker", href: "/for-clients" },
  how: { label: "How it works", href: "/how-it-works" },
  join: { label: "Register as an artist", href: "/join" },
  artistGuide: { label: "How artists get booked", href: "/how-you-get-booked" },
  benefits: { label: "Why artists join", href: "/why-artists-join" },
  inquiry: { label: "Send a job enquiry", href: "/send-job" },
  support: { label: "Support", href: "/support" },
} as const;

export const conciergeOutput = z.object({
  paragraphs: z.array(z.string().max(2000)).min(1).max(6),
  artistSlugs: z.array(z.string().max(160)).max(12),
  pages: z.array(z.string().max(40)).max(6),
});

// Links are emitted separately from server-owned catalog records, never from model text.
export function publicConciergeText(text: string) {
  return maskContacts(text)
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\b(?:sk|rk|pk)_(?:live|test)_[\w]+\b|\bsb_(?:secret|publishable)_[\w]+\b/gi, "[restricted]")
    .replace(/\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|app|ae)\b(?:\/\S*)?/gi, "[contact hidden]");
}

export type ConciergeArtist = { slug: string; name: string; specialty: string; location: string; startingPrice: number; rating: number | null };

export function resolveConciergeReply(value: unknown, artists: ConciergeArtist[]) {
  const parsed = conciergeOutput.parse(value);
  return {
    paragraphs: parsed.paragraphs.map(publicConciergeText),
    artists: [...new Set(parsed.artistSlugs)].flatMap(slug => {
      const artist = artists.find(item => item.slug === slug);
      return artist ? [artist] : [];
    }),
    links: [...new Set(parsed.pages)].flatMap(key => {
      const page = Object.entries(CONCIERGE_PAGES).find(([id]) => id === key)?.[1];
      return page ? [page] : [];
    }),
  };
}

export type ConciergeReply = ReturnType<typeof resolveConciergeReply>;