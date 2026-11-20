import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NavbarDropdown({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="shared-dropdown" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }} onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}>
    <Button variant="ghost" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{label}<ChevronDown className="h-3 w-3" /></Button>
    <div id={id} className="shared-dropdown-panel" hidden={!open} onClick={() => setOpen(false)}>{children}</div>
  </div>;
}