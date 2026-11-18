import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchArtists from "./tools/search-artists";
import listMyBookings from "./tools/list-my-bookings";
import listQuoteRequests from "./tools/list-quote-requests";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "emirate-artist-match",
  title: "Emirate Artist Match",
  version: "0.1.0",
  instructions: "Tools for Dealmaker, a UAE talent marketplace (prices in AED). Search talent, and read your own bookings and booking requests.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchArtists, listMyBookings, listQuoteRequests],
});
