import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PublicLayout } from "@/components/site/PublicLayout";
import { Button } from "@/components/ui/button";

type Details = { client?: { name?: string; redirect_uri?: string } | null; scope?: string; redirect_url?: string; redirect_to?: string; user?: { email?: string } } | null;
type OAuthResult = { data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: Details; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "",
  }),
  head: () => ({ meta: [{ title: "Connect an app | Dealmaker" }, { name: "robots", content: "noindex" },{name:'description',content:'Review a connection requesting access to your Dealmaker account.'},{property:'og:title',content:'Connect an app | Dealmaker'},{property:'og:description',content:'Approve or decline access to your Dealmaker account.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}] }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("This connection link is missing or invalid.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { redirect: location.pathname + location.searchStr } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(id);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    const { data: u } = await supabase.auth.getUser();
    return { details: data, email: u.user?.email ?? "" };
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <PublicLayout><div className="mx-auto max-w-md px-4 py-16"><h1 className="text-2xl font-semibold">Could not load this connection request</h1><p className="mt-2 text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p></div></PublicLayout>
  ),
});

const SCOPE_LABELS: Record<string, string> = { openid: "Confirm who you are", email: "Share your email address", profile: "Share your basic profile" };

function Consent() {
  const { details, email } = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = details?.client?.name ?? "An app";
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve ? await oauth().approveAuthorization(authorization_id) : await oauth().denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("No redirect was returned. Please try connecting again."); return; }
    window.location.href = target;
  }

  return (
    <PublicLayout>
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-2xl bg-card p-6 shadow-card">
          <h1 className="text-2xl font-semibold">Connect {name} to Dealmaker</h1>
          {email && <p className="mt-1 text-sm text-muted-foreground">Signed in as {email}</p>}
          <p className="mt-4">{name} will be able to search talent and read your bookings and booking requests as you.</p>
          {details?.client?.redirect_uri && <p className="mt-2 text-xs text-muted-foreground break-all">Returns to: {details.client.redirect_uri}</p>}
          {scopes.length > 0 && <ul className="mt-4 list-disc ps-5 text-sm space-y-1">{scopes.map((s) => <li key={s}>{SCOPE_LABELS[s] ?? `Additional permission requested: ${s}`}</li>)}</ul>}
          <p className="mt-4 text-xs text-muted-foreground">This does not bypass Dealmaker's permissions.</p>
          {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
          <div className="mt-6 flex gap-2">
            <Button disabled={busy} onClick={() => decide(true)} className="flex-1 bg-gradient-gold text-gold-foreground hover:opacity-90">Approve</Button>
            <Button disabled={busy} variant="outline" onClick={() => decide(false)} className="flex-1">Cancel connection</Button>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
