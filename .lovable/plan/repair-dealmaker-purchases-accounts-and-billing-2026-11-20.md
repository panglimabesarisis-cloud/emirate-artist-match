# Repair Dealmaker purchases, accounts and billing

## Findings and scope

The audit found a deployed AED/IDR settlement mismatch, incorrect Stripe IDR units, paid-plan access without subscription payment, missing recurring billing, unenforced quotas, and incomplete account/team/onboarding flows. All 267 existing tests pass, but none proves a successful hosted purchase.

Keep **all payments in the test environment**. Keep AED invoices/displays and 5% VAT. Do not turn on real charges, payouts or real-money escrow. The project Stripe account still needs the user's connection step; its connection differs from the builder's Stripe dashboard account.

## Confirmed policies

- Registration costs AED 100 plus 5% VAT for every plan, including Free, and does not unlock a paid plan.
- Paid subscriptions are separate. Existing catalog prices remain unchanged.
- Convert test charges at 4,900 IDR per AED using Stripe's actual two-decimal IDR units: AED 105 → IDR 514,500 → `unit_amount=51,450,000`.
- Allocate plan credits monthly (Free 50 / Medium 200 / Pro 500), including annual subscribers; unused credits roll over and purchased top-ups remain separate.
- Preserve existing policies: cancel at paid-period end; upgrades immediate and prorated; downgrades at next renewal.
- After downgrade, keep existing photos, videos, specialties and team members active; block new additions until usage is below the new limit.
- Fix booking commission at quote approval; later plan changes cannot recalculate historical earnings.

## Decisions still needed

The five payment/entitlement questions are answered. Do not delete accounts or financial records until retention/deletion requirements are settled; provide non-destructive closure/request handling instead. Existing bookings without a commission snapshot require an explicit migration/audit trail, not guessed historical plan rates.

## Implementation sequence

### 1. Make one-time payments safe and settle correctly

- Separate immutable AED accounting amount/currency from Stripe IDR amount/currency and exchange-rate snapshot. Existing failed/ambiguous attempts keep their original facts; inspect Stripe before recovery or retry.
- Verify session mode, test environment, order identity, exact processor amount/currency and intended customer. Atomically credit only the stored AED amount and revalidate the invoice/booking installment.
- Serialize purchase attempts and reuse valid pending sessions; distinguish deliberate repeat credit purchases from duplicate clicks. Handle orphan sessions and duplicate successful payments explicitly rather than silently marking them paid or charging again.
- Registration settlement records registration payment only. Enforce one registration deposit without changing the plan or granting subscription credits.
- Add durable event and follow-up processing for notifications, expiry and asynchronous failures; recover paid results after browser closure/reload. Preserve calendar and full-invoice-payment safeguards.
- Clearly separate simulated actions from Stripe test checkout; retain the test banner and actionable missing-connection errors.

### 2. Connect subscriptions and authoritative entitlements

- Create stable monthly/yearly plan prices in the project's connected Stripe test account, derived from the existing catalog. Do not use builder-account tools to create runtime prices in the wrong account.
- Add authenticated embedded subscription checkout, persisted environment-scoped subscription/period records, and verified invoice/subscription webhook reconciliation.
- Paid benefits start only after confirmed subscription payment; scheduled cancellation retains benefits through the paid period. Handle failed renewal/dunning without granting unpaid new periods.
- Add immediate prorated upgrades, scheduled downgrades, billing history and Stripe's account billing portal for payment-method updates/cancellation. Portal is the separate Stripe-supported account-management page, not a checkout redirect.
- Allocate monthly credits once per eligible month, including annual plans, with unique ledger references and catch-up logic. Preserve rollover and purchased credits.
- Stop self-assignment of paid plans on profile insertion and repeated demo credit allocations. Centralize server/database entitlement checks for media, specialties, team seats and configured plan features. Apply downgrade/commission answers without changing historical records blindly.

### 3. Repair account, signup, team and discovery updates

- Add usable password recovery, password/email/display-name settings with reauthentication where required, clear confirmation states, and non-destructive account-closure requests.
- Make talent registration resumable; check every write and report partial progress rather than claiming completion. Persist intended plan separately from current paid entitlement.
- Restore membership invitations/removal and workspace selection, including artists who are also team members. Retain owner-only account/billing settings and enforce seat limits.
- Keep primary and additional specialties consistent and searchable; enforce quotas beyond browser checks.
- Update metadata on affected content pages and fresh security checks after access-rule changes. Public plan-catalog reads remain intentional.

### 4. Finish test-only refund and recovery behavior

- Distinguish simulated refund/escrow/payout records from Stripe test refunds and real money. Correct zero-refund status.
- For Stripe test charges, implement validated test refunds and refund/dispute status reconciliation, with an audit trail and no live-account fallback.
- Persist delivery attempts and safe retries; retain provider setup blockers for real email/WhatsApp/calendar checks instead of claiming simulated delivery succeeded.

## Technical approach

Use existing TanStack server functions, bearer middleware, shared gateway Stripe client and Embedded Checkout (`embedded_page`). Public webhooks verify raw-body Stripe signatures; authenticated account operations use ownership/RLS. Add additive database migrations with explicit grants, RLS and protected SQL transitions. Keep generated integrations untouched. Use one environment-scoped billing/entitlement source; ledger and wallet changes stay atomic.

Preserve authoritative server catalog totals and immutable order snapshots. Never settle IDR as AED, bypass exact comparisons, infer payment from a browser callback, or promote a plan from a submitted profile field. Store durable event/outbox deduplication, not in-memory locks. Add regression tests for every money/access rule.

## Preview test checklist

1. Complete **Payments → Connect your sandbox** by signing in to Stripe; no live activation. Confirm the app's test account and eligible payment methods. Use a dedicated test artist/client, not production financial records.
2. Register Free/Medium/Pro talent. Pay AED 105 registration; reload and confirm registration paid, selected paid plan still inactive until subscription succeeds.
3. Test embedded checkout with **4242 4242 4242 4242**, a future expiry (e.g. 12/30), any 3-digit CVC and required name/address. Verify AED and IDR totals before submitting.
4. Buy credits, pay a standalone invoice, accept a booking contract and pay deposit then balance. Reload each screen; check exact AED balances, one ledger allocation, paid stamp, invoice state, calendar and logged notifications.
5. Repeat clicks, open two tabs, replay events, close checkout before completion and reload. No duplicate charge/benefit; recover paid status without relying on the browser.
6. Decline card **4000 0000 0000 0002**: no benefits, paid stamp or ledger grant. Authentication card **4000 0025 0000 3155**: complete verification and confirm settlement.
7. Subscribe monthly/yearly. Verify benefit limits and billing history. Use Stripe test clocks where compatible to advance renewal/cancellation/downgrade; otherwise exercise isolated timestamped billing fixtures and explicitly mark provider time-travel unverified. Confirm monthly annual-plan credit allocations and rollover.
8. Test profile updates, confirmed email change, password recovery, resumed registration, invitations/workspace switching and multi-specialty search. Attempt cross-user access and initial Pro insertion; both must be rejected.
9. Test over-limit uploads/team invitations, downgrade behavior, test refunds and retry recovery. Check desktop/mobile and Arabic layout on changed screens.

## Acceptance and blockers

Run relevant automated tests and signed-in preview flows with persisted readback; refresh security scans. Payment-account connection, remaining policy answers and external notification/calendar setup are explicit blockers only for their dependent checks. Report each verified result and anything unverified. This plan does not certify legal tax treatment, real escrow, bank payouts, or real-money marketplace compliance.