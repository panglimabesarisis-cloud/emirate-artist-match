import { createContext, useContext } from "react";

export const CLIENT_SECTIONS = ["dashboard", "browse", "bookings", "jobs", "reviews", "messages", "commission", "history", "wallet", "withdrawals", "payout", "statements", "profile", "notifications", "support", "settings"] as const;
export type ClientSection = (typeof CLIENT_SECTIONS)[number];
export const isClientSection = (v: unknown): v is ClientSection => typeof v === "string" && (CLIENT_SECTIONS as readonly string[]).includes(v);

export type PortalModal =
  | { type: "new-booking"; artistId?: string }
  | { type: "booking"; id: string }
  | { type: "quotation"; id: string }
  | { type: "pay"; id: string }
  | { type: "confirm-job"; id: string }
  | { type: "dispute"; id: string }
  | { type: "review"; id: string }
  | { type: "cancel"; id: string }
  | { type: "withdraw" }
  | { type: "payout-account" };

export type PortalCtx = {
  uid: string;
  email: string;
  go: (section: ClientSection, thread?: string) => void;
  openModal: (m: PortalModal) => void;
};

export const PortalContext = createContext<PortalCtx | null>(null);
export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal must be used inside the client portal");
  return ctx;
}
