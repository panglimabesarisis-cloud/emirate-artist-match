import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const db = vi.hoisted(() => ({ signup: null as unknown, plan: "free", rates: 2, saved: [] as unknown[] }));
const fns = vi.hoisted(() => ({
  checkout: vi.fn(async () => ({ checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_abc", sessionId: "cs_test_abc" })),
  check: vi.fn(async () => ({ status: "pending" })),
  cancel: vi.fn(async () => ({ status: "cancelled" })),
}));

vi.mock("@/integrations/supabase/client", () => {
  const tiers = [
    { code: "free", name: "Free", price_monthly: 0, price_yearly: 0, max_specialties: 1, ai_credits: 10, max_photos: 5, max_videos: 1, commission_pct: 15 },
    { code: "basic", name: "Basic", price_monthly: 100, price_yearly: 1000, max_specialties: 2, ai_credits: 100, max_photos: 10, max_videos: 2, commission_pct: 12 },
  ];
  const result = (table: string) => table === "plan_tiers" ? { data: tiers, error: null }
    : table === "rate_cards" ? { count: db.rates, error: null }
    : { data: { id: "a1b2c3d4", stage_name: "Layla", intended_plan: "basic", registration_paid_at: "2026-11-01" }, error: null };
  const from = (table: string) => {
    const query: Record<string, unknown> = { then: (done: (v: unknown) => unknown) => Promise.resolve(result(table)).then(done) };
    for (const name of ["select", "eq", "order", "maybeSingle", "update"]) query[name] = () => query;
    return query;
  };
  return { supabase: {
    from,
    rpc: (name: string) => name === "private_artists" ? from(name) : Promise.resolve({ data: db.plan, error: null }),
    auth: {
      getUser: async () => ({ data: { user: { user_metadata: { signup_plan: db.signup } } }, error: null }),
      updateUser: async ({ data }: { data: { signup_plan: unknown } }) => { db.signup = data.signup_plan; db.saved.push(data.signup_plan); return { error: null }; },
    },
  } };
});
vi.mock("@/lib/billing.functions", () => ({ subscriptionCheckout: fns.checkout, checkSubscription: fns.check, cancelSubscriptionCheckout: fns.cancel }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({ Navigate: ({ to }: { to: string }) => <p>redirect {to}</p> }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (s: string) => s }) }));
vi.mock("@/components/site/PublicLayout", () => ({ PublicLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/site/SandboxCheckout", () => ({ PaymentTestModeBanner: () => null }));
vi.mock("@/components/shared/LogoutButton", () => ({ LogoutButton: () => null }));
vi.mock("@/components/site/ReceiptSheet", () => ({ ReceiptSheet: ({ receipt }: { receipt: { status: string; total: number } }) => <p>invoice {receipt.status} {receipt.total}</p> }));

import { SignupPlanGate } from "./SignupPlanGate";

const show = () => render(<QueryClientProvider client={new QueryClient()}><SignupPlanGate userId="u1" email="t@example.test"><p>the dashboard</p></SignupPlanGate></QueryClientProvider>);

beforeEach(() => { db.signup = { status: "choose" }; db.plan = "free"; db.rates = 2; db.saved = []; vi.clearAllMocks(); });
afterEach(cleanup);

describe("SignupPlanGate", () => {
  it("leaves accounts without the step alone", async () => {
    db.signup = undefined;
    show();
    expect(await screen.findByText("the dashboard")).toBeTruthy();
  });

  it("sends a talent without rate cards back to registration", async () => {
    db.rates = 0;
    show();
    expect(await screen.findByText("redirect /join")).toBeTruthy();
  });

  it("opens the dashboard when Free is chosen", async () => {
    show();
    fireEvent.click(await screen.findByRole("radio", { name: /Free/ }));
    expect(screen.queryByText("the dashboard")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Free" }));
    expect(await screen.findByText("the dashboard")).toBeTruthy();
    expect(db.saved).toEqual([{ status: "done" }]);
  });

  it("locks a paid choice behind an invoice and a payment link", async () => {
    show();
    await screen.findByRole("radio", { name: /Basic/ });
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
    expect(await screen.findByText("invoice unpaid 105")).toBeTruthy();
    const pay = await screen.findByRole("link", { name: /Stripe test payment/ });
    expect(pay.getAttribute("href")).toBe("https://checkout.stripe.com/c/pay/cs_test_abc");
    expect(screen.queryByText("the dashboard")).toBeNull();
  });

  it("switches from a pending payment to Free", async () => {
    db.signup = { status: "pay", plan: "basic", interval: "month" };
    show();
    await screen.findByRole("link", { name: /Stripe test payment/ });
    fireEvent.click(screen.getByRole("button", { name: "Use the Free plan instead" }));
    expect(await screen.findByText("the dashboard")).toBeTruthy();
    expect(fns.cancel).toHaveBeenCalledOnce();
  });

  it("unlocks once the paid plan is verified", async () => {
    db.signup = { status: "pay", plan: "basic", interval: "month" };
    db.plan = "basic";
    show();
    expect(await screen.findByText("the dashboard")).toBeTruthy();
    await waitFor(() => expect(db.saved).toEqual([{ status: "done" }]));
  });
});
