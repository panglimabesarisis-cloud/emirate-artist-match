# Updated preview verification

## Verified
- Resumed an interrupted signed-in talent registration with saved photos, finished all steps, and reached registration payment.
- Registration remains Free with 50 initial credits even when Medium is selected.
- Updated the account name and confirmed the saved value after reload.
- Billing displays separate registration/subscription payments and blocks paid subscription until registration is paid.
- 281 regression tests passed before the final paid-period additions; see the latest test run for those added checks.
- Security scan: six informational findings for intentionally public catalog lists; no error/warning findings.

## Payment blocker
The actual signed-in registration checkout returns Stripe's “No valid payment method types” error and identifies an unclaimed test sandbox. No successful purchase, renewal, refund, subscription change or downstream paid notification is claimed. Complete **Payments → Connect your sandbox** without enabling live money, then retest.

## Preview checklist
1. Register and pay AED 105 (test charge IDR 514,500). Use **4242 4242 4242 4242**, expiry **12/30**, any three-digit CVC, and required billing details.
2. Reload: registration is paid, but Medium/Pro benefits require a separate subscription. Subscribe under **AI credits → Your plan**, then check plan, monthly credits and billing invoice.
3. Buy a credit top-up, pay a standalone invoice, and pay a booking deposit/balance. Reload and verify exact AED balances and one credit/payment entry.
4. Try **4000 0000 0000 0002** for decline and **4000 0025 0000 3155** for authentication. Failed payments must not grant benefits.
5. Repeat clicks/two tabs, close checkout, and reload. Check recovery without duplicate payments or credits.
6. Test immediate prorated upgrade, next-period downgrade, period-end cancellation, and annual monthly credit rollover with Stripe test clocks where supported.
7. Verify over-limit uploads/team additions are blocked while existing items remain; check historical booking commission stays fixed.
8. Test account recovery/email confirmation and actual Calendar/WhatsApp/email delivery separately. Sender/provider setup and old failed payment reconciliation remain external blockers.