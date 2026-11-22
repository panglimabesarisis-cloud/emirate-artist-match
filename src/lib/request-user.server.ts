import { getRequest } from "@tanstack/react-start/server";
import { publicClient } from "./public-client.server";

/**
 * Optional sign-in for public server functions: returns the verified user id when the request
 * carries a valid Supabase bearer token, otherwise null. Never trusts client-sent ids.
 */
export async function optionalUserId(): Promise<string | null> {
  const header = getRequest()?.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  if (token.split(".").length !== 3) return null;
  try {
    const { data, error } = await publicClient().auth.getClaims(token);
    const sub = data?.claims?.sub;
    return !error && typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}
