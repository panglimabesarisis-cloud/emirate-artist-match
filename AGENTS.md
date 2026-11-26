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
- A Stripe customer is reached only through a verified user id; link checkouts (booking, chat invoice) pass `customer_email` and never a saved customer.
- SQL rules read plans with `artist_plan_internal`; `effective_artist_plan` is the client call and answers only the artist, team, admin and server. `has_role` answers only about the caller.
- Admin Settings General, Menu and Invoice are read through `useSiteSettings` / `parseSiteSettings` (src/lib/site-settings.ts); `/search` and `/for-artists` menu entries open the built-in drop-downs, and new invoice numbers take the saved prefix (`invoice_prefix()`, `newInvoiceNumber`).
- Calendar event detail comes from `team_booking_detail` (no client contacts; chat lines only with Inbox access). Rate cards carry per-item `turnaround` and `rush_items`; the AI and booking offers take job type, deposit and rush costs from them. `markWorkReady` asks once for the balance before work is delivered.
- Profile limits (categories, specialities, portfolio, clients) come from `plan_tiers` through `usePlanLimits`, never constants; the database enforces the same numbers (0091). `plan_tiers` is intentionally public read-only; `client_commission_tiers` is readable only by signed-in users, without `updated_by`.
- A client chat needs a signed-in client: `submitQuote`/`startChat` reject guests, artist pages keep the typed form across Google sign-in (src/lib/booking-draft.ts), and `/chat` shows the sign-in window first. Opening messages to artist and client use src/lib/new-chat-message.ts (English).
- After a booking payment the server posts the fixed confirmation (src/lib/payment-confirmation.ts) as the next AI message; the model never writes its own.
- A verified booking or invoice payment posts one `[[RECEIPT]]` system message (id = order id, no contact details) into its chat and returns the payer there (src/lib/payment-proof.server.ts). Render receipts only from `system` messages. The `/booking` page offers no client cancel or dispute cards.
- Plan checkout creates a missing or changed sandbox recurring price from `plan_tiers`; a replaced price is tagged `planCode` before its lookup key moves, and sync identifies plans with `planOfPrice`.
- AI flow WhatsApp steps (`wa_artist`, `wa_client`) are silent: the server writes the saved message (src/lib/flow-whatsapp.ts), fires on saved form/button/start/artist-decision edges or the `send_whatsapp` tool, sends once per chat, step and number through notify.server.ts, caps client numbers per day, and never sends from `test` chats. The AI never writes the message or chooses a number.
- Model calls go through `aiResponse` (src/lib/ai-provider.server.ts): Lovable's gateway first, then Google Gemini with the admin-entered `google_api_key` (admin_secrets) only when the gateway refuses before doing work. The owner chose this fallback over the gateway-only default; artists keep the selected model's credit rate, and the key never reaches client chat code.
- Migrations may be hand-written under `drizzle/migrations/` when Lovable credits are unavailable: add the next numbered file, apply it in the Supabase SQL editor, update `src/integrations/supabase/types.ts` to match, and ask Lovable to re-sync the schema once credits return. `drizzle/schema.ts` stays untouched.
- Custom AI Flow variables use the shared selector and are derived from saved node/field saveAs names; this preserves existing names and carries custom variables through templates and reloads without a separate catalog.
- The client roles may read only the public `artists` columns listed in 0096; contact numbers, TRN, `user_id`, prices and sign-up state come from the `private_artists()` RPC (own artist, active team, admin) or the server. Never `select("*")`, filter on `user_id` or embed a private column from `artists` in a caller-RLS query; a new column stays private until granted. Tested in artist-privacy.database.test.ts.
- Public pages read data through `createServerFn` in `src/lib/public.functions.ts` using a publishable-key client; signed-in dashboards use the browser client under `_authenticated` so RLS enforces ownership.
- Public artist stats come only from the `artist_public_stats()` SQL function, which computes from bookings/reviews and applies each artist's visibility settings — never store or type stat numbers.
- Roles live in `user_roles`; signup may only self-assign artist or client, admin is granted manually.
- Owner-protected columns (artist status/plan/featured, review rating/body) are enforced by DB triggers, not the UI.
- The AI booking agent runs only server-side (`src/lib/agent.server.ts`); clients reach chats through a secret per-conversation link key, and every AI reply is charged via `credit_ledger` (wallet balance is maintained by a DB trigger, never written directly).
- All chat text passes through `maskContacts` (`src/lib/masking.ts`) before storage.
- Optimistic client chat messages use the same contact mask and reconcile against new stored message IDs, so polling cannot display duplicates.
- Booking money/policy rules (VAT, refunds, completion) live in `src/lib/booking-rules.ts` with tests; booking state changes go only through `src/lib/bookings.functions.ts` (clients via secret booking link key, artists via auth).
- Booking notifications use `notify.server.ts` and log every attempt. Server dispatch reads provider/token from admin-only `admin_secrets`; settings return only token presence. Meta retains approved templates and signed status inbox; Fonnte IDs are prefixed and acceptance is not delivery. Artist approval retains its secret link.
- Artist team data access uses `artist_team_can(artist_id, page)` in RLS and server checks; `is_artist_team()` is only workspace membership, and unrelated private areas use `is_artist_owner()` so hidden tabs never authorize data.
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
- Mount SiteHeader once in the root language provider; hide it on dashboard/client/admin paths with a zero-height SSR marker, preserving workspace navigation and sticky offsets.
- How it works and For clients reuse the public reference theme and scene with page-scoped CSS and static journey data; For clients has its own route linked from desktop/mobile navigation so audience content and booking behavior stay independent.
- Artist process and benefits guides use separate content routes with ArtistGuidePage and existing public journey styles; shared desktop/mobile artist navigation targets those routes to keep audience content distinct without altering booking logic.
- Booking offer acceptance issues an invoice before checkout; shared bookingPayment supplies VAT breakdown and integer fils so displayed and charged amounts agree. Booking links reuse verified hosted sessions, not fixed-price links. Optional event details persist in existing notes to avoid a competing booking schema.
- Normalize gateway problem-detail responses in the shared Stripe transport, including HTTP-200 errors, so every checkout fails accurately without exposing gateway details.
- Prefer self-managed Stripe secrets over gateway keys; reject mode mismatches and use the matching webhook secret to prevent live charges in sandbox flows.
- Stripe uses hosted checkout with preserved settlement metadata; verify returns through existing authorized checks. Admin diagnostics verify test balance, create then expire an unpaid session, and return URL presence only.
- Inbox delete controls use eligibility RPCs.
- The home intro (IntroOverlay) frames `public/intro.html`, an exported minified page. Change its controls and scenes in `public/intro-controls.js` and `public/intro-effects.js`; patch the HTML only to expose hooks (`__dmSound`, `__dmFx`).
- Intro music is `public/intro-music.mp3`, a 2-minute excerpt of WombatNoisesAudio "The Legend of Narmer" (CC BY 3.0); keep the on-screen credit in intro-controls.js while it is used.
