# Facebook Live Comment Shield (MVP)

Status: **Implemented on Dev, code-complete. NOT production-ready** — see
Production Readiness below. Companion setup guide:
`docs/FACEBOOK_COMMENT_SHIELD_META_APP_SETUP.md`.

## Purpose

After a livestream, Admin Page currently hides customer comments one at a
time. This module adds one standalone screen — **Facebook Tools → Comment
Shield** — to select a recent livestream and hide every comment on it in
bulk, through Meta's official Graph API. No browser automation, no
personal-account login, no scheduled auto-run, no AI classification, no
reply, no seeding — MVP scope only.

## Architecture

**Reusable integration layer, not a one-off feature.** `lib/facebookTools/`
is split so a future Facebook-based module (e.g. a possible Semi Seeding
Assistant — explicitly **not** built in this phase, scope unchanged here)
can reuse Page connection, post/comment fetching, permission handling, and
audit logging without depending on anything Comment-Shield-specific:

- `facebookGraphClient.ts` + `facebookPage.service.ts` +
  `facebookLivePost.service.ts` — the shared layer. Nothing in these three
  files knows what a "hide job" is.
- `facebookHideJob.service.ts` — Comment Shield's own logic (job/queue,
  retry, comment-hiding), the only file that imports *from* the shared
  layer, never the reverse.
- **Permission**: `facebook_tools.manage` is scoped to the resource
  (`facebook_tools`), not to Comment Shield specifically — a future sibling
  module under Facebook Tools can reuse it, or add its own
  `facebook_tools.<action>` key beside it, following the same
  `requirePermission()` pattern every route here already uses.
- **Audit logging**: routes through the codebase's existing shared
  `logActivity()` (`lib/activityLog.service.ts`), not a Comment-Shield-only
  log — any future module gets the same audit trail for free by calling it
  the same way.

Concretely: `getConnectedPages`/`getPageById`/`getDecryptedPageAccessToken`
(facebookPage.service.ts) and the Graph API wrappers in
facebookGraphClient.ts are the pieces to import directly from a future
module; only Comment Shield's hide-job tables/service are specific to this
feature.

- **Auth**: one permission key, `facebook_tools.manage`, seeded ungranted
  (same convention as every other module — an Owner/Admin grants it via the
  existing Permission Matrix UI, no hardcoded role check).
- **Connection**: Facebook Login for Business (OAuth) → `GET /me/accounts`
  → long-lived Page Access Token per Page, encrypted (AES-256-GCM, Node's
  built-in `crypto`) before storage. Never returned to the browser.
- **Live Post Selection**: reads the Page's `/live_videos` edge (covers
  ended livestreams, not just currently-live ones), cached into
  `facebook_live_posts` for the list screen, refreshed on demand.
- **Hide mechanism**: `POST /{comment-id}?is_hidden=true`, batched via
  Graph API's Batch Request endpoint (up to 50 subrequests/call).
- **Job processing — no cron**: "Ẩn toàn bộ comment" creates a
  `facebook_hide_jobs` row plus one `facebook_hide_comment_logs` row per
  comment (full audit trail). The Comment Shield page then polls
  `POST /api/facebook-tools/hide-jobs/[id]/process` every ~1.2s while open;
  each call drains up to 20 comments via one Graph batch call and returns
  updated progress. Closing the page just stops polling — the job sits at
  its last position and resumes on next visit ("Tiếp tục" is implicit: the
  page auto-resumes polling any non-terminal job it finds). Nothing runs
  when nobody has the page open — this satisfies "không tự động chạy theo
  lịch" while still avoiding a single-request timeout on posts with
  hundreds of comments.
- **Retry**: each comment auto-retries up to 3 attempts across polling
  rounds before being counted as a permanent error; a "Thử lại lỗi" action
  re-queues permanent errors for one more pass.

## Database

Migration: `supabase/migrations/2026082401_facebook_comment_shield_module.sql`
(Dev only — apply per CLAUDE.md's `npm run db:verify-dev` gate).

- `facebook_pages` — one row per connected Page, encrypted token, status
  (Connected / Reconnect Required / Disconnected)
- `facebook_live_posts` — display cache of the Page's Live Videos
- `facebook_hide_jobs` — one row per "Ẩn toàn bộ" run: total/processed/
  success/error counts, status, timestamps
- `facebook_hide_comment_logs` — one row per comment per job: status,
  attempt_count, error_message, processed_at — the audit trail

Same RLS shape as every other module: anon/authenticated full DB access,
real enforcement at the application layer via `permissions` +
`staffHasPermission()`.

## Backend

- `lib/facebookTools/tokenCrypto.ts` — AES-256-GCM encrypt/decrypt
- `lib/facebookTools/facebookGraphClient.ts` — the only file that knows
  Graph API endpoint shapes/version/error codes
- `lib/facebookTools/facebookPage.service.ts` — connect/list/disconnect
- `lib/facebookTools/facebookLivePost.service.ts` — list/sync Live Posts
- `lib/facebookTools/facebookHideJob.service.ts` — create job, process one
  batch (queue-drain + retry), retry failed comments

API routes under `app/api/facebook-tools/` — all gated by
`requirePermission(request, "facebook_tools.manage")`:
`pages`, `pages/connect-url`, `pages/oauth/callback`, `pages/[id]`,
`live-posts`, `hide-jobs`, `hide-jobs/[id]`, `hide-jobs/[id]/process`,
`hide-jobs/[id]/retry`.

## UI

`app/facebook-tools/comment-shield/page.tsx`, linked from a new sidebar
group "Facebook Tools" (`components/Sidebar.tsx`). Fully standalone — no
existing CRM page or route was modified.

## Meta API limitations (read before relying on this in production)

- **`pages_manage_engagement` requires Advanced Access** (App Review +
  Business Verification) to work for anyone beyond the Meta App's own
  testers/admins connecting their own Pages — see the setup guide's §3/§5.
  Until then, this module works in Dev only, with a tester account.
- **Rate limiting** is Business Use Case (BUC)-based, per App+Page. Batch
  requests + a 20-comment-per-poll-round batch size stay comfortably under
  it; a livestream with 1000+ comments just takes more polling rounds
  (visible as ongoing progress, not an error).
- **`is_hidden=true` hides, it does not delete.** Un-hiding is not built in
  this MVP — a hidden comment stays hidden until manually reversed on
  Facebook directly (a fast-follow "unhide" action is a natural next
  increment, not built here).
- **Token invalidation**: a long-lived Page Access Token can still be
  killed by a password change, permission revocation, or the app losing
  Review approval. Error code 190 / subcodes 458-467 are treated as
  "Reconnect Required" and flip the Page's status rather than failing
  silently — see `facebookGraphClient.ts`'s `FacebookGraphError`.
- **Scope is Live Videos only** — regular feed posts (photo/text) are
  never fetched; this module only ever touches `/live_videos` and its
  `comments` edge, matching "livestream" in the original request.

## Testing on Dev

No Meta App exists yet (confirmed with PO 2026-08-23), so real Facebook
connectivity is **unverified**. What's covered instead:

- Unit tests: `tokenCrypto` encrypt/decrypt round-trip;
  `facebookHideJob.service`'s batch/retry logic against a mocked
  `facebookGraphClient` (dependency-injected `client`, same pattern every
  other service in this codebase already uses for tests)
- Manual: permission gate (403 without `facebook_tools.manage`), empty
  states, OAuth-missing-credentials error surfacing (503)
- `tsc` / `eslint` / `next build` — see completion report for results

## Production Readiness

**Not production-ready.** Blocked on, in order:

1. Meta App created + Business Verification + App Review approved for
   `pages_read_engagement`/`pages_manage_engagement` (setup guide §3)
2. `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` / `FACEBOOK_TOKEN_ENCRYPTION_KEY`
   (a Production-only key, never reused from Dev) set on Production
3. `facebook_tools.manage` explicitly granted to the intended Admin
   role(s) via the Permission Matrix UI on Production
4. A separate PO decision to actually deploy/enable this module on
   Production — same release-mechanism gate every other module in this
   codebase goes through
5. Real end-to-end Facebook connectivity verified on Dev first, once an
   App Review-approved Meta App exists — the current implementation is
   architecturally complete but has never called live Graph API endpoints
