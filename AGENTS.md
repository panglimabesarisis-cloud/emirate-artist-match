<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Custom AI Flow variables use the shared selector and are derived from saved node/field saveAs names; this preserves existing names and carries custom variables through templates and reloads without a separate catalog.
- Public pages read data through `createServerFn` in `src/lib/public.functions.ts` using a publishable-key client; signed-in dashboards use the browser client under `_authenticated` so RLS enforces ownership.
- Public artist stats come only from the `artist_public_stats()` SQL function, which computes from bookings/reviews and applies each artist's visibility settings — never store or type stat numbers.
- Roles live in `user_roles`; signup may only self-assign artist or client, admin is granted manually.
- Owner-protected columns (artist status/plan/featured, review rating/body) are enforced by DB triggers, not the UI.
- The AI booking agent runs only server-side (`src/lib/agent.server.ts`); clients reach chats through a secret per-conversation link key, and every AI reply is charged via `credit_ledger` (wallet balance is maintained by a DB trigger, never written directly).
- All chat text passes through `maskContacts` (`src/lib/masking.ts`) before storage.
- Optimistic client chat messages use the same contact mask and reconcile against new stored message IDs, so polling cannot display duplicates.
- Booking money/policy rules (VAT, refunds, completion) live in `src/lib/booking-rules.ts` with tests; booking state changes go only through `src/lib/bookings.functions.ts` (clients via secret booking link key, artists via auth).
- Booking notifications use `notify.server.ts` and log every attempt. Server dispatch reads provider/token from admin-only `admin_secrets`; settings return only token presence. Meta retains approved templates and signed status inbox; Fonnte IDs are prefixed and acceptance is not delivery. Artist approval retains its secret link.
- Artist team access goes through `is_artist_team()` (owner or active `artist_members` row) in RLS and server checks; owner-only areas (profile, credits, AI settings, team, calendar link) use `is_artist_owner()`.
- Calendar feeds are served from `/api/public/calendar/<token>.ics`; the token lives in owner-only `artist_calendar` because `artists` rows are publicly readable.
- Artist photos/videos live in the private `artist-media` bucket (public buckets are blocked by workspace policy); public pages show them via short-lived signed URLs created in `getArtist`.
- Agent integrations (MCP) live in `src/lib/mcp/` with OAuth via the managed auth issuer; tools query as the caller (RLS applies), never with admin keys. Approval page is `/.lovable/oauth/consent`.
- Admin-editable site config lives in `site_settings` (public read, admin write) and `plan_tiers`; admin-entered API keys go in admin-only `admin_secrets` — never put keys in `site_settings`, which is publicly readable.
- AI chat flow: master flow is the `ai_flows` row with null artist_id; an artist row with enabled=true overrides it. `flowToPrompt` in `src/lib/ai-flow.ts` turns the flow into numbered steps inside the agent prompt, below pricing/safety rules so those always win.
- AI form presets and their save-variable names are shared in `src/lib/ai-flow.ts`; the builder adds them without rewriting saved forms so existing flows remain intact.
- Order form reads allow public access only when enabled and the artist is approved; authenticated artist teams can read their own drafts so dashboard editing remains available.
- Talent signup goes through the `/join` wizard; Google sign-ups get the artist role via the `become_artist()` RPC (self-only, never admin) since OAuth can't carry signup metadata.
- Artist Google Calendar uses the per-user App User Connector (`src/lib/calendar.functions.ts`); connection keys are stored encrypted in server-only `app_user_connections`, never sent to the browser.
- Calendar unknown permits only pending artist approval; busy blocks drafts, never chat. Private chat files use key/team-verified reads and validated MIME/paths; persist paths, not URLs. Shared composer keeps quick/full chat consistent.
- Artist wallet numbers come only from the `artist_wallet()` SQL function (completed bookings minus plan commission minus payouts); withdrawals are `payout_requests` rows guarded by a trigger (amount ≤ available, only admins change status).
- Paid-booking WhatsApp details go to the artist's `notify_phone` and `manager_phone` via `notifyTeamPaid` in bookings.functions.
- Talent signup plan choice is kept in localStorage `join_plan` (survives Google OAuth redirect); specialty limits and signup deposit totals live in `src/lib/join-rules.ts` with tests; `/join/payment` uses sandbox-only Stripe checkout for the deposit.

- Test payments use `settle_test_purchase` after Stripe verification; separate processor/accounting snapshots prevent currency corruption. Billing rules live in src/lib/AGENTS.md.
- Service invoices are stored separately from chat messages so payment status stays authoritative; legacy chat-only invoices have no inferred payment state.
- Artist invoice composition uses an item editor and read-only live document preview with shared invoice calculations; client selection only routes delivery, and invoice metadata is not editable there.
- WhatsApp flow approvals snapshot invoice intent on the booking; `approve_flow_booking` atomically approves and posts one linked invoice, paid through the booking contract/escrow checkout to prevent duplicate charges.
- Flow builder previews and client chats share ChatFlowControls so buttons and form dates render identically; a standalone date picker is a single-date-field form, preserving the existing agent contract. These structured controls use shadcn rather than AI Elements because they submit the existing flow text protocol, not an AI SDK transcript.

- Booking invoice approval, partial settlement, calendar and reminder invariants are documented in src/lib/AGENTS.md. UI translation, CSV export and payment-rules conventions are there too.
- Render saved forms/buttons server-side to enforce flow.

- Artist dashboard presentation styles are scoped to html.dm-dash and studio-* classes; decorative DashboardArtwork owns no data access so public styling and existing dashboard queries stay independent.
- Dashboard reference headings, empty states and unsupported fields use StudioPage presentation helpers; adapters target existing control classes and ARIA roles, not absent data-slot attributes, so shared controls and data contracts remain unchanged.
- Mount SiteHeader once inside the root language provider and reuse HomeHeader with the shared catalog query; page layouts omit duplicate headers, and sticky workspaces use its measured height to avoid overlap.
- How it works and For clients reuse the public reference theme and scene with page-scoped CSS and static journey data; For clients has its own route linked from desktop/mobile navigation so audience content and booking behavior stay independent.
