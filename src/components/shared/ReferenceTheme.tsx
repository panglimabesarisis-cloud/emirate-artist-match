import type { ReactNode } from "react";
import "./reference.css";

export function ReferenceTheme({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`dm-reference ${className}`}>{children}</div>;
}