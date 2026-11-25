# Master admin control center
- Artist pages read through `artists/data.ts`; profile completeness comes only from `src/lib/profile-completeness.ts` (also the artist dashboard), identity requirements from `identityRequirements`, and per-artist numbers from `admin_artist_stats()`.
- A package card edits only entitlements the system enforces (`PLAN_LIMITS`, `AI_MODELS`); do not add switches that change nothing.
- Verification files open only through `openVerificationFile`, which logs the access; lists mask document numbers.
- Artist performance reports share one admin-guarded aggregate and Dubai date/artist filters; issued invoice deduplication and completed_at series avoid competing financial records.
- Preserve existing editor and financial mutation components inside an admin-scoped shell; reference HTML supplies colors, never sample data or handlers.
- Read operational totals through guarded aggregate RPCs and paginate financial/transaction lists; no background polling or duplicate ledger is needed for presentation.
- Allocation reports use frozen artist rates and the existing client commission resolver; client rewards come from platform fees and never reduce artist entitlement again.
- Records views are read-only under caller RLS; role assignment, payment settlement and disputed escrow remain on their existing protected paths.