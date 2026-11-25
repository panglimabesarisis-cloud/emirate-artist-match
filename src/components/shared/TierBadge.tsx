import { Trophy } from "lucide-react";

/** Trophy colours of the client commission tiers: dark grey, light grey, silver, dark gold, gold. */
const TIERS: Record<number, { name: string; background: string; color: string }> = {
  1: { name: "Abu tua", background: "#4b5563", color: "#ffffff" },
  2: { name: "Abu muda", background: "#d6d9de", color: "#2b313c" },
  3: { name: "Silver", background: "linear-gradient(135deg,#ffffff 0%,#8ea3c7 48%,#f4f7fc 66%,#65799c 100%)", color: "#24344f" },
  4: { name: "Dark gold", background: "linear-gradient(135deg,#a87c12,#6f5107)", color: "#fff1c2" },
  5: { name: "Gold", background: "linear-gradient(135deg,#ffeb9a 0%,#ffcb2d 50%,#e6a400 100%)", color: "#4a3500" },
};

export function TierBadge({ tier, size = 34 }: { tier: number; size?: number }) {
  const look = TIERS[tier] ?? TIERS[1]!;
  return (
    <span role="img" aria-label={`Tier ${tier}`} title={`Tier ${tier} · ${look.name}`} data-tier={tier}
      className="inline-grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: look.background, color: look.color, boxShadow: "0 0 0 1px rgba(246,239,226,.18)" }}>
      <Trophy aria-hidden style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}
