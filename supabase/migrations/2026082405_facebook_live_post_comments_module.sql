-- Facebook Live Comment Shield — Phase 3 foundation (2026-08-24).
--
-- Business requirement: process comments only after a livestream ends, no
-- real-time moderation. Adds a dedicated READ CACHE of comment content —
-- facebook_live_post_comments — sitting between facebook_live_posts and
-- facebook_hide_jobs:
--
--   facebook_live_posts -> facebook_live_post_comments (this file)
--     -> facebook_hide_jobs -> facebook_hide_comment_logs
--
-- Deliberately a SEPARATE table, not an extension of
-- facebook_hide_comment_logs (PO decision, 2026-08-24) — that table is a
-- hide job's own audit trail (what was attempted, did it succeed), never
-- a comment content store; conflating them would mean comment content
-- only exists once a hide job has already been created, blocking any
-- "review before hiding" surface. This table follows the exact same shape
-- as facebook_live_posts: a display cache of Graph API data, refreshed on
-- demand, never a source of truth.
--
-- Scope: ONE new table, no ALTER on any existing table, no new permission
-- (reuses facebook_tools.manage), no RLS convention change, no change to
-- hide-job logic anywhere.

BEGIN;

CREATE TABLE IF NOT EXISTS facebook_live_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  facebook_live_post_id uuid NOT NULL REFERENCES facebook_live_posts(id) ON DELETE CASCADE,
  facebook_comment_id text NOT NULL,

  author_id text,
  author_name text,
  message text,
  comment_created_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facebook_live_post_comments_live_post
  ON facebook_live_post_comments(facebook_live_post_id);

-- Idempotency for a future re-sync (same reasoning as every other
-- Facebook-sourced cache table in this module): re-fetching the same
-- livestream's comments must upsert, never duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_facebook_live_post_comments_comment_id
  ON facebook_live_post_comments(facebook_comment_id);

DROP TRIGGER IF EXISTS facebook_live_post_comments_set_updated_at ON facebook_live_post_comments;
CREATE TRIGGER facebook_live_post_comments_set_updated_at
BEFORE UPDATE ON facebook_live_post_comments
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE facebook_live_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON facebook_live_post_comments;
CREATE POLICY "Allow full access to anon" ON facebook_live_post_comments
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON facebook_live_post_comments;
CREATE POLICY "Allow full access to authenticated" ON facebook_live_post_comments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'facebook_live_post_comments';
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'facebook_live_post_comments' ORDER BY ordinal_position;
-- SELECT indexname FROM pg_indexes WHERE tablename = 'facebook_live_post_comments' ORDER BY indexname;
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename = 'facebook_live_post_comments';
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'facebook_live_post_comments';
-- SELECT permission_key FROM permissions WHERE resource = 'facebook_tools'; -- expect unchanged (still just facebook_tools.manage)
