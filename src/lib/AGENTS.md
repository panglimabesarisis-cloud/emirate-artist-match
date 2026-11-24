# Booking workflow rules
- Travel fees use the tested fils calculator and owner-owned settings; client-stated distances remain estimates, never model-inferred payable amounts.
- Broadcast applications create conversations atomically only after verified client approval; private inquiry files require caller-RLS checks before signed URLs, and approving an applicant is not booking or price consent.
- Resolve displayed button selections against saved edges before WhatsApp hand-off; artist review never implies client price consent, and existing Calendar, invoice and payment checks still apply.
- Fonnte replies require a shared secret and private deduplicated inbox; atomic decisions match logged approval recipients/references, preserve invoice-item approval, and durably claim follow-up work without blindly retrying ambiguous sends.

- Reachable Rate Card flow blocks enable artist-item invoice approval; snapshot event hours and job details on the booking, approve items atomically, and never treat draft prices or AI payment claims as settlement.
- Booking deposits use VAT-inclusive minor units with server-owned percentages; settlement adds only the verified amount, linked invoices become paid only at full settlement, and calendar writes use deterministic event IDs.
- Managed booking jobs retry failed calendar writes and claim H-7 reminders before dispatch; WhatsApp acceptance is not delivery and public jobs must authenticate managed cron requests.

# Library rules
- Public booking agents, artist test chats and private artist task assistants use the workspace-resolved text/tool default; hidden legacy model settings do not override automatic execution, and verified per-model rates remain mandatory.
- Incoming chat/form sources select only their connected saved graph before all form, button and approval resolvers run; legacy flows keep their existing root.
- AI task billing uses service-only reservations and fractional ledger deltas, with verified provider-rate snapshots and per-task settlement; missing rates/usage fail closed rather than inventing prices or replaying uncertain inference.
- Missing model pricing is a configuration failure, not human takeover; save the client message and preserve AI mode without inference so later messages can resume after verified rates are configured.
- Master Library reads protected content through existing admin/team RPCs; shared query refresh updates separate sessions, and copied form/workflow content stays independent with source-version tracking.
- Uploaded contract reference content is imported only through an authenticated admin server function as inactive drafts; handler-local imports keep restricted clauses out of browser bundles and preserve existing templates.

- UI translation uses `src/lib/i18n.tsx` (`t()` with English text as key, Arabic fallback to English; catalog rows use `name_ar` via `localName`); use logical CSS (start/end, ps/pe) so RTL works.
- CSV exports go through `toCsv` in `src/lib/csv.ts`, which neutralises spreadsheet formulas.
- Payment settlement and subscription entitlement predicates live in `src/lib/payment-rules.ts` with unit tests so checkout integration can apply confirmed policies without trusting browser success screens.
- Processor amounts/currencies are immutable order snapshots separate from accounting amounts; only verified server settlement may apply accounting amounts, and pending purchases use durable keys rather than in-memory locks.
- Billing and quota checks derive from verified environment-scoped subscription periods; paid invoice-line periods preserve historical monthly allocations, and quote-approval commission snapshots never change with later plans.
- Paid library items (prompts, flow/form templates) settle only via settle_test_purchase after Stripe verification; full refunds set refunded_at and revoke use but keep copied content.
- Paid content (prompt bodies, form template fields) is hidden by column grants; listings are security-invoker views and admins read hidden content via definer functions.

- Private artist agent tools query through caller RLS and effective-plan eligibility; Calendar writes require owner-confirmed server-authored actions with atomic claims, and saved invoices render privately without client delivery or financial mutation.
- Verification codes use keyed server-side hashes and service-only atomic limits; identity submissions use the owner-checked transaction RPC, and document signing requires an admin check plus an access-log write.
- Verification retention removes bytes through Storage before transactional redaction; category ranking uses recorded escrow-release timestamps, never inferred historical release dates or client-supplied earnings.
