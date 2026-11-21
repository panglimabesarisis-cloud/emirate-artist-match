# Paid AI prompts, flow templates and order form templates (test payments)

Artists can buy paid AI prompts, flow templates and order form templates through the existing test checkout. Ownership is granted only after the payment is confirmed with Stripe on the server. Plan and credit pack prices stay unchanged.

## Files to change (no src/components or src/routes edits)

**src/lib/payments.functions.ts — `artistCheckout`**
- Accept the input `{ kind: 'agent_prompt' | 'flow_template' | 'order_form_template', itemId: uuid }` alongside the existing credits and deposit kinds. Validate the UUID format.
- Look up the item server-side with the admin client (that client can read the hidden content, but only the price and status are read). Reject the purchase when:
  - the item is inactive or unpublished (flow templates use `published`)
  - the price is 0 (free items need no checkout)
  - the item is already owned (paid and not refunded)
  - the item's tier is above the artist's effective plan (`effective_artist_plan`). This applies to prompts and form templates; flow templates have no tier.
- Amount: `round(price_aed * 1.05 * 100)`, always taken from the database row. Then call `openOrder({ kind, target_id: itemId, amount_minor }, "Dealmaker <title> (incl. VAT 5%)")`.

**src/lib/payments.server.ts**
- Widen the `openOrder` kind type to include the 3 new kinds. The purchase key already covers `target_id`, so repeat clicks reuse the same order.
- No change to `reconcileOrder`. It already verifies the Stripe session server-side before calling `settle_test_purchase`.

**src/lib/payment-events.server.ts** (called by the existing webhook route)
- Make sure `checkout.session.completed` and the async succeeded event pass through to `reconcileOrder` for the new kinds, so the webhook is the main settlement path.
- Add a `charge.refunded` handler (if it is not handled yet) that looks up the order by payment intent and calls the refund SQL step below.

**src/lib/refunds.server.ts**
- Reuse `record_test_refund`. After a full refund of an item order, the database marks the purchase as refunded (handled in SQL, see below).

**src/lib/billing-rules.ts (+ test)**
- Add `itemAmountMinor(priceAed)` (5% VAT, rounded) with a test: 49 AED → 5145 minor.

## Database changes (one migration)

**`payment_orders`**
- Extend its `kind` check constraint, if it has one, to allow `agent_prompt`, `flow_template` and `order_form_template`. Keep all existing values.
- Add a partial unique index on `(artist_id, kind, target_id)` where `status = 'paid'` and kind is one of the item kinds. This stops double settlement.

**`begin_test_purchase`**
- Accept the new kinds and store `target_id`. No price logic: the amount is computed only on the server.

**`settle_test_purchase`** (keep the existing locking, amount and currency checks)
- When the order flips from pending to paid, add a branch per kind:
  - `agent_prompt` → upsert `agent_prompt_purchases (artist_id, prompt_id, stripe_session_id, paid_at=now(), refunded_at=null)`
  - `flow_template` → upsert `ai_flow_template_purchases`
  - `order_form_template` → upsert `order_form_template_purchases`
- It is idempotent: an order that is already paid returns early, as it does today. The function stays service-role only, so the browser can never write a purchase row.

**`record_test_refund`**
- When the refunded total reaches the full processor amount for an item order, set `refunded_at = now()` on the matching purchase row.
- Partial refunds keep access.

**When a purchase is refunded**
- `guard_prompt_enable` already requires a purchase that is not refunded. Add a trigger on `agent_prompt_purchases`: when `refunded_at` is set, delete that artist's `agent_prompt_enabled` row, so the prompt stops being used.
- `use_flow_template` and `use_order_form_template` already require a purchase that is not refunded.
- Content already copied into `ai_flows` or `artist_order_forms` is left untouched.

**Grants**
- No change. Only the service role writes the purchase tables.

## Risks
- **Return page settles the payment too.** The existing return page path also calls `reconcileOrder`. It checks with Stripe on the server, not with browser data, but it does mean settlement can happen before the webhook arrives. If it must be webhook-only, I would block item kinds in that path; that could slow down when the purchase shows up after paying.
- **Price changes mid-checkout.** An open checkout keeps its old price, because the purchase key includes the amount and a price change creates a new order.
- **Mixed currencies.** Test checkout charges in IDR with an AED accounting snapshot (existing pattern). Item prices follow the same conversion.
- **Refund events.** Stripe may not send `charge.refunded` to the webhook yet. I may need to subscribe the test webhook to that event (no code change).
- **Tier ranking.** The order free < basic < medium < pro is hardcoded in SQL and in TS. A future new plan needs both places updated.
- **No buy buttons in the app.** Calling the new kinds needs an update to the screens, which are off-limits, so the feature works only from the server side until a later task adds them.
- **Live mode.** This stays sandbox-only, like credit top-ups.
