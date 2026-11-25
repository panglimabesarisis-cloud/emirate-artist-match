import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ plan: "free", updates: [] as Array<{ values: unknown; filters: unknown[][] }> }));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async () => ({ data: db.plan, error: null }),
    from: () => ({
      update: (values: unknown) => {
        const call = { values, filters: [] as unknown[][] };
        db.updates.push(call);
        const query: Record<string, unknown> = { then: (done: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(done) };
        for (const name of ["eq", "not"]) query[name] = (...args: unknown[]) => { call.filters.push([name, ...args]); return query; };
        return query;
      },
    }),
  },
}));

import { approvePaidArtist } from "./billing.server";

beforeEach(() => { db.plan = "free"; db.updates = []; });

describe("approvePaidArtist", () => {
  it("leaves a talent without a paid subscription in review", async () => {
    await approvePaidArtist("a1");
    expect(db.updates).toEqual([]);
  });

  it("approves only a pending, finished and deposit-paid profile", async () => {
    db.plan = "basic";
    await approvePaidArtist("a1");
    expect(db.updates).toEqual([{ values: { status: "approved" }, filters: [
      ["eq", "id", "a1"], ["eq", "status", "pending"], ["eq", "onboarding_complete", true], ["not", "registration_paid_at", "is", null],
    ] }]);
  });
});
