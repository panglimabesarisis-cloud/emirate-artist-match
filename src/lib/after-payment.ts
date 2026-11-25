/**
 * Where "Continue" goes after a verified payment: straight to the dashboard, with no further status pages.
 * A guest paying through a secret booking or chat link has no dashboard, so they go back to that link.
 */
export function afterPaymentPath(returnTo: string, signedIn: boolean) {
  if (returnTo.startsWith("/join/payment") || returnTo.startsWith("/dashboard")) return "/dashboard";
  return signedIn ? "/dashboard" : returnTo;
}
