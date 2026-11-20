import { Check } from "lucide-react";

/** Render only after authoritative payment confirmation. */
export function PaidStamp() {
  return <div className="paid-stamp" role="status" aria-label="PAID" dir="ltr"><Check className="size-5 shrink-0" aria-hidden="true" /><span>PAID</span></div>;
}