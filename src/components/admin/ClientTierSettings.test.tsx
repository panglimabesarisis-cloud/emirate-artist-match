import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const db = vi.hoisted(() => ({ upserts: [] as unknown[], updates: [] as { values: unknown; tier: unknown }[] }));

vi.mock("@/integrations/supabase/client", () => {
  const tiers = [1, 2].map((tier) => ({ tier, commission_pct: tier + 1, target_amount: tier * 250, min_withdrawal: tier * 250 }));
  const chain = (result: unknown) => { const q: Record<string, unknown> = { then: (done: (v: unknown) => unknown) => Promise.resolve(result).then(done) }; for (const name of ["select", "order", "maybeSingle"]) q[name] = () => q; return q; };
  return { supabase: { from: (table: string) => ({
    ...chain(table === "client_commission_tiers" ? { data: tiers, error: null } : { data: { commission_pct: 2, min_withdrawal: 500, enabled: true }, error: null }),
    upsert: async (row: unknown) => { db.upserts.push(row); return { error: null }; },
    update: (values: unknown) => ({ eq: (_column: string, tier: unknown) => ({ select: async () => { db.updates.push({ values, tier }); return { data: [{ tier }], error: null }; } }) }),
  }) } };
});
vi.mock("@/components/dashboard/StudioPage", () => ({ StudioSection: ({ children }: { children: ReactNode }) => <section>{children}</section> }));

import { ClientTierSettings } from "./ClientTierSettings";

// The switch measures itself, which jsdom cannot do.
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
afterEach(cleanup);

describe("ClientTierSettings", () => {
  it("saves each tier and refuses an impossible rate", async () => {
    render(<QueryClientProvider client={new QueryClient()}><ClientTierSettings /></QueryClientProvider>);
    const rate = await screen.findByLabelText("Tier 1 commission");
    const save = screen.getByRole("button", { name: "Save commission tiers" }) as HTMLButtonElement;
    fireEvent.change(rate, { target: { value: "25" } });
    expect(save.disabled).toBe(true);
    fireEvent.change(rate, { target: { value: "2.5" } });
    fireEvent.change(screen.getByLabelText("Tier 2 target"), { target: { value: "600" } });
    fireEvent.click(save);
    await waitFor(() => expect(db.updates).toHaveLength(2));
    expect(db.updates).toEqual([
      { tier: 1, values: { commission_pct: 2.5, target_amount: 250, min_withdrawal: 250 } },
      { tier: 2, values: { commission_pct: 3, target_amount: 600, min_withdrawal: 500 } },
    ]);
    expect(db.upserts).toEqual([{ id: true, commission_pct: 2, min_withdrawal: 500, enabled: true }]);
  });
});
