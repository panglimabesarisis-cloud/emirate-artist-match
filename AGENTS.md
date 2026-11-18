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
- Public pages read data through `createServerFn` in `src/lib/public.functions.ts` using a publishable-key client; signed-in dashboards use the browser client under `_authenticated` so RLS enforces ownership.
- Public artist stats come only from the `artist_public_stats()` SQL function, which computes from bookings/reviews and applies each artist's visibility settings — never store or type stat numbers.
- Roles live in `user_roles`; signup may only self-assign artist or client, admin is granted manually.
- Owner-protected columns (artist status/plan/featured, review rating/body) are enforced by DB triggers, not the UI.
- The AI booking agent runs only server-side (`src/lib/agent.server.ts`); clients reach chats through a secret per-conversation link key, and every AI reply is charged via `credit_ledger` (wallet balance is maintained by a DB trigger, never written directly).
- All chat text passes through `maskContacts` (`src/lib/masking.ts`) before storage.
- Booking money/policy rules (VAT, refunds, completion) live in `src/lib/booking-rules.ts` with tests; booking state changes go only through `src/lib/bookings.functions.ts` (clients via secret booking link key, artists via auth).
- Booking emails/WhatsApp go through `src/lib/notify.server.ts`, which logs every attempt in `notifications` (status `pending_setup` until the email domain / WhatsApp connector exists); artist approval uses a separate per-booking `artist_key` link so artists can approve without signing in.
