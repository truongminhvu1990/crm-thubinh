-- Facebook Live Comment Shield — Phase 2 schema addition (2026-08-24).
--
-- Business requirement changed: Comment Shield processes completed
-- livestreams after selling sessions, not real-time live moderation. Review
-- found facebook_live_posts had no column for Facebook's own broadcast
-- status (LIVE / LIVE_STOPPED / PROCESSING / VOD / ...) — only this
-- module's own `processing_status` (hide-job progress, a distinct concept,
-- left completely untouched by this migration). Without it, the CRM
-- couldn't tell, from local data alone, whether a synced post was actually
-- an ended livestream.
--
-- Scope: ONE additive column, no other change. No permission added (none
-- needed — reuses the existing facebook_tools.manage gate this table
-- already sits behind). No RLS change (existing anon/authenticated
-- policies already cover every column on this table, including new ones).

BEGIN;

ALTER TABLE facebook_live_posts
  ADD COLUMN IF NOT EXISTS broadcast_status text;

-- Free text, no CHECK constraint — same convention as every other
-- status/type column in this codebase (e.g. partners.partner_type,
-- seeding_campaigns.status): validated nowhere strictly since it's a
-- direct pass-through of whatever Meta's Graph API returns in a live
-- video's own `status` field, not a value this application invents or
-- constrains. Confirmed non-exhaustive set already seen from real Graph
-- API responses/errors during this module's testing: LIVE, LIVE_STOPPED,
-- PROCESSING, VOD (also documented by Meta: UNPUBLISHED,
-- SCHEDULED_UNPUBLISHED, SCHEDULED_LIVE, SCHEDULED_EXPIRED,
-- SCHEDULED_CANCELED).

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'facebook_live_posts' AND column_name = 'broadcast_status';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'facebook_live_posts' AND column_name = 'processing_status'; -- confirms this migration didn't touch it
