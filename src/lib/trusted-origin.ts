/** Return/redirect origins come only from known hosts, never from an unchecked Host header. */
const FALLBACK = "https://dealmakertalent.com";
export function isTrustedHost(host: string) {
  return host === "dealmakertalent.com" || host === "www.dealmakertalent.com" || host === "localhost"
    || /^[a-z0-9-]+\.lovable\.app$/.test(host) || /^[a-z0-9-]+\.lovableproject\.com$/.test(host);
}
export function trustedOrigin(req: Request | undefined) {
  if (!req) return FALLBACK;
  try {
    const url = new URL(req.url);
    const forwarded = url.hostname === "localhost" ? req.headers.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase() : null;
    if (forwarded && isTrustedHost(forwarded.split(":")[0] ?? "")) return `https://${forwarded}`;
    if (isTrustedHost(url.hostname)) return url.origin;
  } catch { /* fall through */ }
  return FALLBACK;
}
