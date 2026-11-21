import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverviewPlan } from "./OverviewPlan";

type Rows = Record<string, { data: unknown; count?: number }>;
const state: { rows: Rows; plan: string } = { rows: {}, plan: "free" };

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const result = () => ({
      data: state.rows[table]?.data ?? null,
      count: state.rows[table]?.count ?? null,
      error: null,
    });
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) b[m] = () => b;
    b["maybeSingle"] = () => Promise.resolve(result());
    b["then"] = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(ok, bad);
    return b;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      rpc: () => Promise.resolve({ data: state.plan, error: null }),
    },
  };
});
vi.mock("./BillingPanel", () => ({ BillingPanel: () => null }));
vi.mock("./TopUpPanel", () => ({ TopUpPanel: () => null }));

const tiers = [
  { code: "free", name: "Free", ai_credits: 50, features: [], sort: 1 },
  { code: "medium", name: "Medium", ai_credits: 200, features: ["Calendar sync"], sort: 3 },
];

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OverviewPlan artistId="a1" stageName="Dede FK" plan="free" openModal={() => {}} />
    </QueryClientProvider>,
  );
}

describe("OverviewPlan", () => {
  it("shows no subscription on the free plan, credits and the invoice donut", async () => {
    state.plan = "free";
    state.rows = {
      plan_tiers: { data: tiers },
      artist_subscriptions: { data: [] },
      credit_wallets: { data: { balance: 47 } },
      conversations: { data: null, count: 3 },
      service_invoices: {
        data: [
          { id: "i1", total: 1000, status: "sent", bookings: { paid_amount: 0 } },
          { id: "i2", total: 2000, status: "sent", bookings: { paid_amount: 500 } },
          { id: "i3", total: 3000, status: "paid", bookings: null },
        ],
      },
    };
    mount();
    expect(await screen.findByText("No subscription")).toBeTruthy();
    expect(await screen.findByText("47 credits")).toBeTruthy();
    expect(screen.getByText("Free plan")).toBeTruthy();
    // 3 chats + 1 unpaid + 1 partial + 1 paid
    expect(await screen.findByText("6")).toBeTruthy();
    expect(screen.getByText("Partial invoices")).toBeTruthy();
  });

  it("counts down a paid subscription", async () => {
    state.plan = "medium";
    const end = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const start = new Date(Date.now() - 16 * 86_400_000).toISOString();
    state.rows = {
      plan_tiers: { data: tiers },
      artist_subscriptions: {
        data: [
          { id: "s1", status: "active", paid_until: end, period_end: end, period_start: start },
        ],
      },
      credit_wallets: { data: { balance: 330 } },
      conversations: { data: null, count: 0 },
      service_invoices: { data: [] },
    };
    mount();
    expect(await screen.findByText(/days left/)).toBeTruthy();
    expect(screen.getByText("330 credits")).toBeTruthy();
    expect(screen.getByText("Medium plan")).toBeTruthy();
  });
});
