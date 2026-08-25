-- Facebook Content Discovery Foundation (Phase 2A) — net-new module under
-- Facebook Tools, alongside Comment Shield (2026082401) and Semi Seeding
-- (2026082402). Read-only cache of a connected Page's own regular feed
-- posts (GET /{page-id}/posts), refreshed on demand — never a source of
-- truth (Facebook is), same convention as facebook_live_posts.
--
-- Scope: 1 new table. No new permission (reuses facebook_tools.manage,
-- already seeded by 2026082401 — this stays within "manage data from a
-- Connected Facebook Page in Facebook Tools", per PO decision). No column
-- added to any existing table. facebook_live_posts/facebook_hide_jobs/
-- facebook_hide_comment_logs/Comment Shield's service code are untouched.
--
-- Fields below were verified against a real Connected Page on Dev
-- (read-only Graph API capability proof, 2026-08-25) before this migration
-- was written — every column maps to a field Graph API actually returned
-- for this app's token, not a guessed/documented-but-unconfirmed field.
--
-- facebook_page_posts and facebook_live_posts are deliberately NOT merged
-- and NOT deduplicated against each other in this phase (PO decision) — a
-- livestream can appear in both caches under different Facebook object
-- ids; reconciling that is out of scope here.

BEGIN;

-- ============================================================
-- 1. facebook_page_posts
-- ============================================================

CREATE TABLE IF NOT EXISTS facebook_page_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  facebook_page_id text NOT NULL REFERENCES facebook_pages(facebook_page_id) ON DELETE CASCADE,
  facebook_post_id text NOT NULL UNIQUE,

  message text,
  permalink_url text,
  full_picture_url text,
  -- Meta's own classification of the post (Graph API's `status_type` field,
  -- e.g. "added_photos", "mobile_status_update") — free text pass-through,
  -- no CHECK constraint, same convention as facebook_live_posts.broadcast_status.
  status_type text,

  comment_count integer NOT NULL DEFAULT 0,
  reaction_count integer NOT NULL DEFAULT 0,
  share_count integer NOT NULL DEFAULT 0,

  published_at timestamptz,

  -- Active / Unavailable / Refresh Failed — see
  -- lib/facebookTools/facebookPagePost.service.ts for exact semantics.
  discovery_status text NOT NULL DEFAULT 'Active',

  last_synced_at timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facebook_page_posts_page ON facebook_page_posts(facebook_page_id);
CREATE INDEX IF NOT EXISTS idx_facebook_page_posts_published_at ON facebook_page_posts(published_at);
CREATE INDEX IF NOT EXISTS idx_facebook_page_posts_discovery_status ON facebook_page_posts(discovery_status);

DROP TRIGGER IF EXISTS facebook_page_posts_set_updated_at ON facebook_page_posts;
CREATE TRIGGER facebook_page_posts_set_updated_at
BEFORE UPDATE ON facebook_page_posts
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE facebook_page_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON facebook_page_posts;
CREATE POLICY "Allow full access to anon" ON facebook_page_posts
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON facebook_page_posts;
CREATE POLICY "Allow full access to authenticated" ON facebook_page_posts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'facebook_page_posts';
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename = 'facebook_page_posts';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'facebook_page_posts' ORDER BY ordinal_position;
