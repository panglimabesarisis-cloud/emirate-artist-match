# Verification backend handoff

Applied migrations:
- `drizzle/migrations/0059_private_verification_and_monthly_top_badges.sql`
- `drizzle/migrations/0060_verification_retention_batch_and_file_validation.sql`
- `drizzle/migrations/0061_verification_explicit_private_grants.sql`

The artist `VerificationPage.tsx` is unchanged. Its old direct identity-application insert is deliberately rejected with `use_submit_verification`; replace that handler with the transaction below. Uploads still use `verification-docs/<owner auth UUID>/...`. No layout changes are needed. Never copy personal details or extra file paths into `note`.

## Client server functions

Import from `@/lib/verification.functions` and call with `useServerFn`, wrapping arguments in `{ data: ... }`. Authentication is required; artist functions resolve the owned artist from the authenticated user, not a client-selected user id.

### `requestVerificationOtp({ phone: string })`

Full international format, e.g. `+971501234567` (spaces/hyphens normalized).

Success: `{ ok: true, expires_in: 300, resend_after: 30 }`.
Failure: `{ ok: false, error: 'invalid_phone' | 'not_configured' | 'send_failed' | 'forbidden' | 'rate_limited', retry_after?: number }`.

`rate_limited` covers both the 30-second resend interval and three requests in a rolling hour; `retry_after` is seconds. Failed/ambiguous send attempts also consume the allowance to avoid abusive retries. Fonnte acceptance is not proof of delivery. Neither plaintext codes nor Fonnte responses are logged/stored/returned; a keyed HMAC is bound to artist + OTP id + code. Configuration uses the existing admin-only `fonnte_token` and the newly stored `VERIFICATION_OTP_HASH_SECRET`.

### `confirmVerificationOtp({ code: string })`

Success: `{ ok: true, phone: string, phone_confirmed_at: ISO timestamp }`.
Failure: `{ ok: false, error: 'expired' | 'wrong_code' | 'too_many' | 'not_configured' | 'forbidden', tries_left?: number }`.

Wrong attempts 1–4 return `wrong_code` with 4/3/2/1 tries left. The fifth returns `too_many` with zero; even a correct code is refused after that. Only the latest accepted code is checked, valid for five minutes. The confirmed phone lives in the private OTP record until submission, then is copied into verification details. Later confirmation also updates an unredacted pending details record.

### `submitVerification({ artistId, details, files })`

```typescript
type Details = {
  residency: 'uae' | 'foreign';
  full_name: string;
  doc_number: string;
  doc_expiry: string; // YYYY-MM-DD, future
  dob?: string;      // YYYY-MM-DD; foreign applicant must be at least 18
  nationality?: string; // required for foreign
  address?: Record<string, string>; // required for foreign
  phone: string; // exactly the confirmed international number
};
type File = {
  kind: 'id_front' | 'id_back' | 'passport' | 'national_id'
      | 'selfie_center' | 'selfie_left' | 'selfie_right';
  storage_path: string;
};
```

Success: `{ ok: true, application_id: UUID, status: 'submitted' }`.
Failure: `{ ok: false, error: 'forbidden' | 'phone_not_confirmed' | 'application_exists' | 'staff_review_required' | 'invalid_details' | 'invalid_files' }`.

All three selfies are required; UAE also requires both ID sides, foreign requires a passport. Files must already exist as JPG/PNG/WebP in the owner's folder and cannot be reused from another application. Pending includes `submitted`, `under_review`, and `needs_more_info`; approved also blocks new submission. Two rejected identity applications require staff review. Input-validation failures throw validation errors; infrastructure/authentication failures throw rather than falsely returning success.

## Admin functions

### `openVerificationFile({ applicationId: UUID, fileId?: UUID })`

Returns `{ url: string, expires_in: 120 }` after server-verified admin access and a successful access-log insert. Throws `forbidden`, `file_not_found`, `documents_deleted`, `access_log_failed`, or `file_unavailable`; read failures throw a generic open failure. Direct authenticated Storage downloads/signing are blocked, including for admins; use this action for every file button. An already-issued signed URL remains usable until its short expiry.

Omit `fileId` only for an older application's `doc_path`; it is validated against the owner's folder and logged with a null file id. The admin screen preserves this legacy-document button without guessing document kinds or parsing free-text personal information.

### `decideVerification({ applicationId: UUID, status, reasons: string[], admin_note: string })`

`status`: `'approved' | 'rejected' | 'needs_more_info'`.
Returns `{ ok: true, id: UUID, status: string, decided_at: ISO timestamp | null }` or `{ ok: false, error: 'reasons_required' | 'application_not_found' }`.
Throws `forbidden`, `documents_deleted`, or `decision_failed` on authorization/write failure. At least one reason is required for rejection or more-info decisions. Reasons are up to 10 strings, 250 characters each; note up to 2,000 characters.

The existing admin Verification queue now reads `verification_details(*)` and `verification_files(*)`, lists every file, displays details and has the four reference reasons plus free text. `admin_note` is retained. Artist status reads remain on `verification_applications`; use its new `reasons` array for “What went wrong”.

## Database RPCs

All return `jsonb` unless stated otherwise.

- `submit_verification(_artist uuid, _details jsonb, _files jsonb)` — owner-only; same submission result shape/errors above.
- `my_verification_rank(_artist uuid)` — owner-only; `{ percentile: number | null, category: string | null, disputes: number, next_refresh: ISO timestamp }`; other artists throw `forbidden` (`42501`). Lower percentile is better (0 is the leader); top eligibility is `percentile <= 10`. Multiple categories return the best percentile. No earnings or other artists' ranks are exposed.
- `refresh_top_badges()` — service-role only; `{ granted: number, removed: number }`. Ranks non-seed approved artists by actual released money (paid less refunds) in each primary/selected category over six months; grants `top` only with verified identity, effective paid plan, at least three distinct paying clients in that window, and zero open disputes. Existing `top_performer` automation is preserved separately.
- `reserve_verification_otp(_artist uuid, _id uuid, _phone text, _hash text)` — service-role only; reservation result above. Never call from the browser.
- `check_verification_otp(_artist uuid, _id uuid, _hash text)` — service-role only; confirmation result above. Never call from the browser.
- `verification_file_owned_path(_application uuid, _path text)` — authenticated owner-scoped boolean helper used by the file INSERT policy; foreign/unavailable paths return false.
- `finalize_verification_retention(_application uuid)` — service-role only; boolean. Refuses early or still-present Storage objects; otherwise deletes file rows and redacts sensitive details/legacy note and doc path. Keeps application result, decision/submission/confirmation dates and access audit.
- `finalize_verification_retention_batch(_applications uuid[])` — service-role only, maximum 100 ids; `{ purged: number, failed: number }`.

## Schedules and retention

- Managed job `verification-photo-retention`: `0 22 * * *`, POST `/api/public/jobs/verification-retention`, body `{}`, existing managed cron authentication. Runs nightly at 02:00 Dubai. The route is currently **not published** (published URL returns 404); local unauthenticated request correctly returns 401. Publish later when ready; this task did not publish.
- SQL job `verification-monthly-top-badges`: `0 0 1 * *`, calls `refresh_top_badges()`, first day monthly at 04:00 Dubai. It is database-only and already active independently of publishing.
- Retention worker `runVerificationRetention()` removes bytes via one Storage API batch, then calls the transactional batch finalizer; max 100 applications per invocation. Returns `{ purged, failed, remaining, has_more }`. The route adds `ok`, returns 503 on failure, and 200 otherwise. `has_more` flags a full batch requiring another authenticated invocation; monitor this if daily decisions approach/exceed 100. Nightly cadence means deletion occurs on the first run after the 30-day threshold, not an exact second.
- No actual Storage deletion, WhatsApp delivery, admin signed-file opening or scheduled run was performed as part of verification; isolated tests use synthetic data and rollback. Metadata never finalizes after failed Storage removal.

## Historical release dates

`bookings.escrow_released_at` records actual future transitions to released/partially-refunded without changing payment amounts, commissions or existing lifecycle triggers. There is no reliable historical release timestamp in the existing schema. Legacy NULL dates are intentionally excluded rather than guessed from payment/completion dates; supply audited historical dates separately if retrospective ranking is needed.

## Tests

- `docs/database-tests/verification.sql` with `verification-fixture.sql`: rollback-only isolated PostgreSQL tests for expiry, wrong attempts, resend/hour rate limits, atomic submission, staff-review cap, private reads/grants, redaction after Storage success, badge grant/removal and private rank.
- `src/lib/verification.server.test.ts`: keyed hashes, six-digit generation, Fonnte dispatch/no plaintext persistence, error shapes, rate limiting, and Storage-before-finalization ordering.
