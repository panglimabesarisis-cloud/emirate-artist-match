/**
 * Registration ends with a subscription choice: the dashboard opens once the talent picks Free,
 * or picks a paid plan and pays it. The choice is kept on the auth account because it only gates
 * the screen; plan limits always come from effective_artist_plan() in the database.
 */
export type PaidSignupPlan = "basic" | "medium" | "pro";
export type SignupPlan =
  | { status: "choose" }
  | { status: "pay"; plan: PaidSignupPlan; interval: "month" | "year" }
  | { status: "done" };

/** Key in the auth user's metadata. Accounts without it registered earlier and are never gated. */
export const SIGNUP_PLAN_KEY = "signup_plan";

export function readSignupPlan(value: unknown): SignupPlan | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v["status"] === "choose" || v["status"] === "done") return { status: v["status"] };
  if (v["status"] !== "pay") return null;
  const plan = v["plan"];
  const interval = v["interval"];
  // An unreadable paid choice is asked again rather than silently opening the dashboard.
  if ((plan !== "basic" && plan !== "medium" && plan !== "pro") || (interval !== "month" && interval !== "year")) return { status: "choose" };
  return { status: "pay", plan, interval };
}

/** open: show the dashboard. rates: finish the rate card first. choose / pay: the subscription step. */
export type SignupGate = "open" | "rates" | "choose" | "pay";

export function signupGate(input: { signup: SignupPlan | null; depositPaid: boolean; rateCards: number; effectivePlan: string }): SignupGate {
  const { signup, depositPaid, rateCards, effectivePlan } = input;
  if (!signup || signup.status === "done" || !depositPaid || effectivePlan !== "free") return "open";
  if (rateCards === 0) return "rates";
  return signup.status;
}
