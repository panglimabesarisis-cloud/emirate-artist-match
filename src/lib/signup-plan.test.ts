import { describe, expect, it } from "vitest";
import { readSignupPlan, signupGate } from "./signup-plan";

const base = { depositPaid: true, rateCards: 2, effectivePlan: "free" };

describe("readSignupPlan", () => {
  it("ignores accounts that registered before this step", () => {
    expect(readSignupPlan(undefined)).toBeNull();
    expect(readSignupPlan({ status: "other" })).toBeNull();
  });
  it("keeps a complete paid choice and asks again for a broken one", () => {
    expect(readSignupPlan({ status: "pay", plan: "pro", interval: "year" })).toEqual({ status: "pay", plan: "pro", interval: "year" });
    expect(readSignupPlan({ status: "pay", plan: "free", interval: "year" })).toEqual({ status: "choose" });
  });
});

describe("signupGate", () => {
  it("never gates old accounts, finished ones or an unpaid deposit", () => {
    expect(signupGate({ ...base, signup: null })).toBe("open");
    expect(signupGate({ ...base, signup: { status: "done" } })).toBe("open");
    expect(signupGate({ ...base, depositPaid: false, signup: { status: "choose" } })).toBe("open");
  });
  it("asks for the rate card before the subscription", () => {
    expect(signupGate({ ...base, rateCards: 0, signup: { status: "choose" } })).toBe("rates");
  });
  it("locks until a plan is chosen and paid", () => {
    expect(signupGate({ ...base, signup: { status: "choose" } })).toBe("choose");
    expect(signupGate({ ...base, signup: { status: "pay", plan: "basic", interval: "month" } })).toBe("pay");
    expect(signupGate({ ...base, effectivePlan: "basic", signup: { status: "pay", plan: "basic", interval: "month" } })).toBe("open");
  });
});
