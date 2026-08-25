-- Facebook Live Comment Shield (MVP) — net-new module. After a livestream,
-- Admin hides every customer comment on the Live Video in bulk instead of
-- one at a time, via Meta's official Graph API (no browser automation, no
-- personal-account login).
--
-- Scope: 4 new tables + 1 new permission. No column added to any existing
-- table.
--
-- facebook_pages.access_token_encrypted stores an AES-256-GCM ciphertext
-- (iv + authTag + ciphertext, base64) produced by
-- lib/facebookTools/tokenCrypto.ts — never a plaintext token. Decryption
-- only ever happens server-side inside lib/facebookTools services.
--
-- facebook_live_posts is a display cache of the Page's /live_videos edge,
-- refreshed on demand — not a source of truth (Facebook is).
--
-- facebook_hide_jobs / facebook_hide_comment_logs implement the queue: one
-- job per "Ẩn toàn bộ comment" click, one log row per comment, so progress
-- (processed/success/error) and a full audit trail both come straight from
-- these rows. There is no background worker or cron — a job is drained by
-- repeated POST .../hide-jobs/[id]/process calls issued by the Admin's own
-- browser while the page is open (see lib/facebookTools/facebookHideJob.service.ts).
--
-- Same RLS shape as every other module here — anon/authenticated full
-- access at the DB layer, real enforcement at the application layer via
-- the `permissions` table (facebook_tools.manage) + staffHasPermission().

BEGIN;

-- ============================================================
-- 1. facebook_pages
-- ============================================================

CREATE TABLE IF NOT EXISTS facebook_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  facebook_page_id text NOT NULL UNIQUE,
  page_name text NOT NULL,

  access_token_encrypted text NOT NULL,
  token_expires_at timestamptz,

  status text NOT NULL DEFAULT 'Connected',

  connected_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facebook_pages_status ON facebook_pages(status);

DROP TRIGGER IF EXISTS facebook_pages_set_updated_at ON facebook_pages;
CREATE TRIGGER facebook_pages_set_updated_at
BEFORE UPDATE ON facebook_pages
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE facebook_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON facebook_pages;
CREATE POLICY "Allow full access to anon" ON facebook_pages
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON facebook_pages;
CREATE POLICY "Allow full access to authenticated" ON facebook_pages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2. facebook_live_posts
-- ============================================================

CREATE TABLE IF NOT EXISTS facebook_live_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  facebook_page_id text NOT NULL REFERENCES facebook_pages(facebook_page_id) ON DELETE CASCADE,
  facebook_post_id text NOT NULL UNIQUE,

  title text,
  message text,
  live_at timestamptz,
  comment_count integer NOT NULL DEFAULT 0,
  processing_status text NOT NULL DEFAULT 'Not Processed',

  last_synced_at timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facebook_live_posts_page ON facebook_live_posts(facebook_page_id);
CREATE INDEX IF NOT EXISTS idx_facebook_live_posts_live_at ON facebook_live_posts(live_at);

DROP TRIGGER IF EXISTS facebook_live_posts_set_updated_at ON facebook_live_posts;
CREATE TRIGGER facebook_live_posts_set_updated_at
BEFORE UPDATE ON facebook_live_posts
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE facebook_live_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON facebook_live_posts;
CREATE POLICY "Allow full access to anon" ON facebook_live_posts
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON facebook_live_posts;
CREATE POLICY "Allow full access to authenticated" ON facebook_live_posts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3. facebook_hide_jobs
-- ============================================================

CREATE TABLE IF NOT EXISTS facebook_hide_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  facebook_live_post_id uuid NOT NULL REFERENCES facebook_live_posts(id) ON DELETE CASCADE,

  status text NOT NULL DEFAULT 'pending',
  total_comments integer NOT NULL DEFAULT 0,
  processed_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,

  started_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facebook_hide_jobs_post ON facebook_hide_jobs(facebook_live_post_id);
CREATE INDEX IF NOT EXISTS idx_facebook_hide_jobs_status ON facebook_hide_jobs(status);

DROP TRIGGER IF EXISTS facebook_hide_jobs_set_updated_at ON facebook_hide_jobs;
CREATE TRIGGER facebook_hide_jobs_set_updated_at
BEFORE UPDATE ON facebook_hide_jobs
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE facebook_hide_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON facebook_hide_jobs;
CREATE POLICY "Allow full access to anon" ON facebook_hide_jobs
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON facebook_hide_jobs;
CREATE POLICY "Allow full access to authenticated" ON facebook_hide_jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4. facebook_hide_comment_logs
-- ============================================================

CREATE TABLE IF NOT EXISTS facebook_hide_comment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  hide_job_id uuid NOT NULL REFERENCES facebook_hide_jobs(id) ON DELETE CASCADE,
  facebook_comment_id text NOT NULL,

  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  error_message text,
  processed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facebook_hide_comment_logs_job ON facebook_hide_comment_logs(hide_job_id);
CREATE INDEX IF NOT EXISTS idx_facebook_hide_comment_logs_status ON facebook_hide_comment_logs(hide_job_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_facebook_hide_comment_logs_job_comment ON facebook_hide_comment_logs(hide_job_id, facebook_comment_id);

ALTER TABLE facebook_hide_comment_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON facebook_hide_comment_logs;
CREATE POLICY "Allow full access to anon" ON facebook_hide_comment_logs
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON facebook_hide_comment_logs;
CREATE POLICY "Allow full access to authenticated" ON facebook_hide_comment_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 5. Permission — seeded ungranted, same convention as Partner Center
--    (2026081001_partner_center_module.sql): an Owner/Admin assigns it to
--    roles afterward via the Permission Matrix UI, no hardcoded role grant.
-- ============================================================

INSERT INTO permissions (permission_key, resource, action) VALUES
  ('facebook_tools.manage', 'facebook_tools', 'manage')
ON CONFLICT (permission_key) DO NOTHING;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'facebook_%' ORDER BY table_name;
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename LIKE 'facebook_%';
-- SELECT permission_key FROM permissions WHERE resource = 'facebook_tools';
-- Expect zero rows until an Owner/Admin grants it via the Permission Matrix UI:
-- SELECT r.role_key, p.permission_key FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE p.resource = 'facebook_tools';
