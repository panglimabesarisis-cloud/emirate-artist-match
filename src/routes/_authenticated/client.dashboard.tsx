import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { NewAccountPhoneGate } from "@/components/shared/AccountWhatsApp";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/lib/i18n";
import { ClientPortal } from "@/components/client/ClientPortal";
import { CLIENT_SECTIONS, type ClientSection } from "@/components/client/portal-context";

const searchSchema = z.object({
  section: z.enum(CLIENT_SECTIONS).optional().catch(undefined),
  thread: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/client/dashboard")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Client dashboard | Dealmaker" },
      { name: "description", content: "Manage your artist bookings, confirm completed jobs and track your Dealmaker commission in one place." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Client dashboard | Dealmaker" },
      { property: "og:description", content: "Bookings, job confirmations, messages and commission for Dealmaker clients." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientDashboardPage,
});

function ClientDashboardPage() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const { section, thread } = Route.useSearch();
  const navigate = useNavigate({ from: "/client/dashboard" });
  const onNavigate = useCallback((next: ClientSection, th?: string) => {
    void navigate({ search: { ...(next === "dashboard" ? {} : { section: next }), ...(th ? { thread: th } : {}) } });
  }, [navigate]);
  if (loading || !user) return <div className="p-16 text-center text-muted-foreground">{t("Loading…")}</div>;
  return <NewAccountPhoneGate userId={user.id} createdAt={user.created_at}><ClientPortal uid={user.id} email={user.email ?? ""} section={section ?? "dashboard"} thread={thread} onNavigate={onNavigate} /></NewAccountPhoneGate>;
}
