# Master admin control center
- Preserve existing editor and financial mutation components inside an admin-scoped shell; reference HTML supplies colors, never sample data or handlers.
- Read operational totals through guarded aggregate RPCs and paginate financial/transaction lists; no background polling or duplicate ledger is needed for presentation.
- Allocation reports use frozen artist rates and the existing client commission resolver; client rewards come from platform fees and never reduce artist entitlement again.
- Records views are read-only under caller RLS; role assignment, payment settlement and disputed escrow remain on their existing protected paths.