import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";

/** "Join as talent" and "Create a profile" make no sense to someone already signed in as an artist. */
export function HideForArtist({ children }: { children: ReactNode }) {
  const { user, isArtist } = useAuth();
  return user && isArtist ? null : <>{children}</>;
}
