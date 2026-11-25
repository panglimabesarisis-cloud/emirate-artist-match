# Stripe hosted checkout

## Values to replace

No sample prices, product IDs, mode values, or return URLs were introduced. Existing database-derived prices, recurring Stripe Price IDs, 5% VAT-inclusive totals and processor/accounting snapshots are unchanged. This project remains sandbox-only.

## Configured parameters

Session creation lives in [payments.server.ts](src/lib/payments.server.ts), [billing.server.ts](src/lib/billing.server.ts), and [stripe-check.server.ts](src/lib/stripe-check.server.ts), using [shared settings](src/lib/hosted-checkout.ts).

| Parameter | Value |
|---|---|
| ui_mode | hosted_page (installed Stripe SDK 22.0.2) |
| billing_address_collection | auto |
| phone_number_collection.enabled | false |
| automatic_tax.enabled | false |
| allow_promotion_codes | false |
| payment_method_collection | always, subscriptions only |
| submit_type | auto |
| integration_identifier | hosted_web_0001 |
| origin_context | web |

Existing customer, metadata, payment-intent description, subscription metadata and idempotency references are retained because verified settlement depends on them. Embedded-only redirect_on_completion is removed. The Stripe client uses the installed SDK's default API version rather than guessing a version.

## Setup and next steps

- Keep `STRIPE_SECRET_KEY` as a private test-mode credential in secure project settings, never source code. `STRIPE_WEBHOOK_SECRET` must match the test webhook endpoint. Both names are configured; delivery still requires verification. No browser publishable key is needed for hosted checkout. No dependencies were added.
- Ensure the test account has compatible payment methods and recurring prices matching the existing catalog (a missing plan price is created from the catalog at the first checkout; a differing one is rejected). The existing IDR sandbox processor conversion is intentionally preserved; accounting and displayed prices remain AED. This task does not migrate currency or change prices.
- Buttons open the returned Stripe-hosted URL. Success returns to [checkout-return.tsx](src/routes/checkout-return.tsx), which calls the existing owner-authenticated or secret-link-authorized verification functions. A browser return never proves payment or grants ownership. Cancel returns to the originating booking, chat, registration, or dashboard page.
- Open embedded sessions from before this change are expired before a retry can create a hosted session; existing hosted sessions are reused. Completed sessions remain subject to existing verified settlement.
- Admin **Check test checkout** verifies credentials through Stripe balance, creates an unpaid hosted test session, checks URL presence without exposing it, then expires it. No charge, order or entitlement is created by this diagnostic.
- Test cards: `4242 4242 4242 4242` (successful card payment), `4000 0000 0000 3220` (authentication), `4000 0000 0000 9995` (decline), with a future expiry and any three-digit CVC, on Stripe test pages only.
- Publish to apply these changes to the live site. Then verify successful payment, cancel/retry, repeat verification, subscription activation, refunds, and signed webhook delivery against real test orders. Do not enable live charging for this demo-only project.
- Fulfillment, order tracking, refunds and copied-content retention reuse existing payment settlement rules and webhook handlers; no new payment datastore or webhook was added.
- References: https://docs.stripe.com/payments/checkout and https://docs.stripe.com/mcp and https://support.stripe.com

## Verification results

- 48 focused payment tests passed, including unchanged pricing, test-mode guards, hosted return URLs, retained metadata, existing-session reuse, and safe expiry of older embedded sessions.
- A signed-in temporary artist's registration button opened the real Stripe sandbox hosted URL. Returning without payment correctly remained unconfirmed. Expiring that session read back as expired through the existing verified payment function.
- The signed-in admin Payments screen verified the connected credential as test mode; **Check test checkout** created a hosted test session, confirmed URL presence, and expired it without payment.
- The hosted page displayed the sandbox merchant and registration product but remained in its loading state during browser verification. Card entry, paid completion, subscription renewal, refunds, and signed webhook delivery remain unverified; these require a completed real sandbox test after publishing. No screenshots or payments were taken.
- Temporary artist data, unpaid order, seeded allocation, diagnostic administrator role and checkout customer were removed. The temporary auth user is managed by the verification tool and removed when the turn ends.