# Dealmaker purchase and account audit

## Verified status

- The project uses Lovable Cloud, React/TanStack Start, authenticated server functions, and signed public payment links. Internal payment requests call server functions; Stripe requests use the shared gateway transport, not direct private keys.
- The runtime Stripe connection is an Indonesia-based test account, not the account reported by the builder's Stripe tools. Its default currency is IDR; account connection remains in progress. Its account read returned no active capabilities and `charges_enabled=false`; a test checkout still needs verification after connection. This is not evidence of a completed test purchase.
- Hosted auth settings were read successfully: email and Google enabled, signup enabled, email confirmation required, anonymous signup disabled. The separate Lovable sign-in flow is present but was not verified through a complete sign-in.
- The public auth, registration and registration-payment pages render without browser runtime errors. The payment page currently presents a pay button when signed out rather than a sign-in requirement.
- All 267 existing tests across 36 files pass. These tests do not establish hosted payment settlement correctness.
- Hosted `payment_orders` contains 23 failed orders (22 booking, 1 credits), none with a recorded Stripe session. No verified successful purchase was established. Missing session IDs do not prove no Stripe session or payment exists: inspect Stripe before retrying ambiguous attempts.
- Existing security scans are stale. Their sole returned database finding is intentional public reading of the plan catalog, not exposure of private billing data. A fresh security review is required after fixes.

## Current business model and purchase paths

| Area | Current implementation |
| --- | --- |
| Catalog | Public category/specialty/rate-card data; admin-editable `plan_tiers`. Free: AED 0, 50 credits, 20% commission; Medium: AED 199/month or 1,990/year, 200 credits, 15%; Pro: AED 499/month or 4,990/year, 500 credits, 10%. |
| Registration | `/join` chooses plan, signs in/registers, saves talent data and routes to `/join/payment`. Flat AED 100 plus AED 5 VAT. Current settlement incorrectly assigns selected plan and may allocate its credits. User confirmed registration does not purchase a subscription. |
| Credits | Authenticated artist selects a server-owned package; checkout includes 5% VAT; verified settlement should append a credit ledger entry. Wallet maintained by a trigger. |
| Service invoice | Secret chat-link verification loads the stored invoice total. Standalone invoice pays directly; booking-linked invoice routes through contract/booking checkout. |
| Booking | Artist approval and contract acceptance precede payment. Server-owned installment percentage determines initial deposit or full payment; subsequent checkout covers remaining balance. Full settlement marks linked invoice paid. Calendar and team notification follow settlement. |
| Plans | Current dashboard uses simulated plan switching. Real recurring checkout, billing periods and renewals are not connected; policy helpers alone do not activate or expire benefits. |
| Accounts | Email/Google/Lovable sign-in UI and artist/client/admin roles. Artist ownership and team checks exist. Business profile editing exists, but general account settings/recovery/deletion flows are missing. |
| Refunds and payouts | Database-only simulated cancellation/refund/dispute and withdrawal records; no actual Stripe refund, seller onboarding or bank payout integration. Keep explicitly test-only. |

## Purchase implementation

1. Browser calls `artistCheckout`, `invoiceCheckout`, or booking checkout. Ownership or secret-link checks resolve authoritative products and prices.
2. `openOrder` resolves a Stripe Customer with searchable user metadata, inserts an AED order and creates `mode:payment`, `ui_mode:embedded_page`, `redirect_on_completion:never` checkout through `createStripeClient('sandbox')`.
3. Stripe currently receives `Math.round((AED_fils / 100) * 4900)` as IDR `unit_amount`. IDR is **two-decimal for Stripe charges**; this is 100 times smaller than intended. AED 105 should charge IDR 514,500 via 51,450,000 processor minor units.
4. Embedded checkout's completion callback, manual payment check, or signed completion webhook retrieves the Stripe session server-side.
5. `sandboxPaymentSettled` recognizes a paid test IDR session, but deployed `settle_sandbox_order` compares it to the order's AED currency and AED minor amount. It rejects the payment. Simply removing the comparison would corrupt balances because the function adds the incoming processor amount divided by 100 to AED booking balances.

Sources: `src/lib/payments.functions.ts:8–32`, `src/lib/payments.server.ts:25–55`, `src/lib/payment-rules.ts:11–12`, `src/routes/api/public/payments/webhook.ts:1–8`, deployed `settle_sandbox_order` readback.

## Prioritized gaps

### Payment integrity

- **Blocking:** mismatched processor currency/amount and accounting currency/amount. Persist both with immutable exchange-rate snapshots; verify processor fields, settle AED fields.
- **High:** repeat clicks create different orders/sessions. New-order UUID idempotency does not prevent duplicate purchase charges. Serialize attempts, reuse pending sessions, and reconcile ambiguous outcomes.
- **High:** registration deposit currently activates paid plans, contrary to the confirmed policy.
- **High:** notification errors after committed settlement can be lost permanently. Use a durable outbox rather than relying on `changed=true` callback execution.
- **Medium:** session creation can succeed before storing its ID fails, leaving an orphan. Recover by stable attempt metadata and expire safely; never blindly charge again.
- **Medium:** webhook handles only completion and async success, not expiry/async failure/refund/dispute/subscription lifecycle. Add durable, deduplicated event processing and narrowly scoped recovery.
- **Medium:** settings provider is `demo`, but checkout hardcodes Stripe test mode. Make simulated actions and Stripe test actions explicit; do not enable live mode.

### Entitlements and renewals

- **High:** artist INSERT can self-assign a paid plan; deployed protection trigger guards UPDATE only. Restrict initial plan and protected fields server-side/database-side.
- **High:** alternating demo plan switches grants repeated plan credits; a check against only the current plan is insufficient. Separate test entitlements and allocate once per eligible period.
- **High:** no stored subscription, paid-through dates, renewal handling, cancellation expiry, upgrade proration, scheduled downgrade, payment-method management, or billing history.
- **High:** media counts and specialty limits are not enforced in database/server rules. Advertised feature/team limits need one shared entitlement source and server enforcement.
- **Confirmed policy corrections:** allocate monthly credits with rollover; preserve existing usage after downgrade; fix commission at quote approval. Current wallet recalculates historical commission from current plan and must be corrected with auditable handling of legacy bookings.

### Account and catalog updates

- Team tab renders phone settings rather than membership management; artist users cannot reliably accept/switch into invited workspaces (`dashboard.tsx:50–63,210`; `TeamTabs.tsx:46–72`).
- Multi-specialty signup saves an array, but public discovery filters only the singular first specialty (`join.tsx:203–205`; `public.functions.ts:34–36,118–119`). Profile edits can desynchronize them.
- Signup ignores several package/media/profile write failures and prevents wizard resumption after initial artist creation (`join.tsx:212–219,58–59,85`).
- Missing email/password update, password recovery, account display-name management, and safe account closure. Destructive deletion/financial retention needs a policy before implementation.
- Media downgrade handling, team seats and advertised search/advanced-AI/export benefits need a concrete eligibility matrix; existing plan strings are not sufficient enforcement.
- Several older content routes lack social-card type metadata; correct while updating affected content pages, without treating the managed auth layout as a content route.

## Verification boundaries

No authenticated purchase, subscription, refund, renewal or provider delivery was claimed as verified. Real WhatsApp/email delivery and calendar write remain separate provider/setup dependencies listed in the roadmap. Test escrow is bookkeeping only, not protected bank funds or Stripe Connect transfers.

Stripe currency reference: https://docs.stripe.com/currencies (IDR absent from the zero-decimal list; charges use two decimals).