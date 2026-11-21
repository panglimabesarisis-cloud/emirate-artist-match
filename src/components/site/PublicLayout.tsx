import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";

export function PublicLayout({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-h-screen flex flex-col ${className}`}>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
