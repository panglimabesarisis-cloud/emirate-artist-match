/**
 * Where "Continue" goes after a verified payment: straight to the dashboard, with no further status pages.
 * The registration deposit leads to /join, which shows the rate card step (or the dashboard if already filled).
 * A guest paying through a secret booking or chat link has no dashboard, so they go back to that link.
 */
export function afterPaymentPath(returnTo: string, signedIn: boolean) {
  if (returnTo.startsWith("/join/payment")) return "/join";
  if (returnTo.startsWith("/dashboard")) return "/dashboard";
  // A purchase made on the AI agent page returns there; that page asks for its own sign-in.
  if (returnTo.startsWith("/ai/")) return returnTo;
  return signedIn ? "/dashboard" : returnTo;
}
