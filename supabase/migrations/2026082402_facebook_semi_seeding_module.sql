-- Facebook Semi Seeding Assistant (MVP) — net-new module under Facebook
-- Tools, alongside Comment Shield (2026082401_facebook_comment_shield_module.sql).
--
-- Semi-auto, not auto: AI drafts comment variants, a human staff member
-- picks/edits one and posts it on Facebook themselves. No comment-posting
-- integration exists anywhere in this schema or its service layer — that
-- is a hard PO constraint, not an oversight.
--
-- Scope: 3 new tables + 2 new permissions. Deliberately does NOT reference
-- or reuse any Comment Shield table (facebook_live_posts/
-- facebook_hide_jobs/facebook_hide_comment_logs) — PO instruction. The
-- only shared table referenced is facebook_pages (via its
-- facebook_page_id, same as facebook_live_posts already does), reusing
-- the Page connection Comment Shield already built; a target post's
-- content is fetched on demand via Graph API and snapshotted here, with
-- no separate posts-browser table.
--
-- No column added to any existing table (products, staff, etc.).

BEGIN;

-- ============================================================
-- 1. seeding_campaigns
-- ============================================================

CREATE TABLE IF NOT EXISTS seeding_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name text NOT NULL,

  facebook_page_id text NOT NULL REFERENCES facebook_pages(facebook_page_id) ON DELETE CASCADE,
  facebook_post_id text NOT NULL,
  post_content_snapshot text,

  product_id uuid REFERENCES products(id) ON DELETE SET NULL,

  -- Free text, not a CHECK constraint — same convention as
  -- partners.partner_type/customers.vip_level: validated at the
  -- application layer (lib/seeding/seeding.constants.ts) so a future
  -- objective can be added without a migration.
  objective text NOT NULL,

  status text NOT NULL DEFAULT 'Draft',

  created_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seeding_campaigns_page ON seeding_campaigns(facebook_page_id);
CREATE INDEX IF NOT EXISTS idx_seeding_campaigns_status ON seeding_campaigns(status);

DROP TRIGGER IF EXISTS seeding_campaigns_set_updated_at ON seeding_campaigns;
CREATE TRIGGER seeding_campaigns_set_updated_at
BEFORE UPDATE ON seeding_campaigns
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE seeding_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON seeding_campaigns;
CREATE POLICY "Allow full access to anon" ON seeding_campaigns
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON seeding_campaigns;
CREATE POLICY "Allow full access to authenticated" ON seeding_campaigns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2. seeding_comment_suggestions — every AI-proposed variant, not just
--    the ones a Task ends up using (audit of what AI suggested).
-- ============================================================

CREATE TABLE IF NOT EXISTS seeding_comment_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  campaign_id uuid NOT NULL REFERENCES seeding_campaigns(id) ON DELETE CASCADE,

  category text NOT NULL,
  content text NOT NULL,

  -- Which Generate/Regenerate round produced this variant — regeneration
  -- feeds prior batches back to the AI as "don't repeat these" context
  -- (lib/seeding/seedingComment.ai.service.ts), so batch history is kept.
  generation_batch integer NOT NULL DEFAULT 1,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seeding_comment_suggestions_campaign ON seeding_comment_suggestions(campaign_id);

ALTER TABLE seeding_comment_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON seeding_comment_suggestions;
CREATE POLICY "Allow full access to anon" ON seeding_comment_suggestions
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON seeding_comment_suggestions;
CREATE POLICY "Allow full access to authenticated" ON seeding_comment_suggestions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3. seeding_tasks — the queue a "Người thực hiện" (assigned staff)
--    works from; also this module's Tracking (§4 of the PO brief: who
--    executed, which comment, when, result).
-- ============================================================

CREATE TABLE IF NOT EXISTS seeding_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  campaign_id uuid NOT NULL REFERENCES seeding_campaigns(id) ON DELETE CASCADE,
  facebook_post_id text NOT NULL,

  -- Nullable: a staff member may hand-type a comment instead of picking
  -- an AI suggestion. comment_text is always populated (snapshotted at
  -- task-creation time) so a later edit/regeneration of the suggestion
  -- row never silently changes an already-assigned task.
  suggested_comment_id uuid REFERENCES seeding_comment_suggestions(id) ON DELETE SET NULL,
  comment_text text NOT NULL,

  assigned_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  scheduled_at timestamptz,

  status text NOT NULL DEFAULT 'Pending',

  -- Tracking (§4): who actually executed it, when, and the free-text
  -- result — Facebook's Graph API doesn't expose per-comment engagement
  -- without scraping, which is out of MVP scope, so "result" is a manual
  -- note, not a metric.
  executed_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  executed_at timestamptz,
  result_note text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seeding_tasks_campaign ON seeding_tasks(campaign_id);
CREATE INDEX IF NOT EXISTS idx_seeding_tasks_assigned_staff ON seeding_tasks(assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_seeding_tasks_status ON seeding_tasks(status);

DROP TRIGGER IF EXISTS seeding_tasks_set_updated_at ON seeding_tasks;
CREATE TRIGGER seeding_tasks_set_updated_at
BEFORE UPDATE ON seeding_tasks
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE seeding_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON seeding_tasks;
CREATE POLICY "Allow full access to anon" ON seeding_tasks
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON seeding_tasks;
CREATE POLICY "Allow full access to authenticated" ON seeding_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4. Permissions — seeded ungranted, same convention as every other
--    module (e.g. 2026081001_partner_center_module.sql,
--    2026082401_facebook_comment_shield_module.sql). Two keys, not one:
--    seeding.manage (campaigns + AI generation, Admin/Manager) is
--    deliberately separate from seeding.execute (view + update the
--    status of a Task assigned to that staff member) — "Người thực
--    hiện" in the PO brief is regular staff, not the Admin-only
--    audience Comment Shield has.
-- ============================================================

INSERT INTO permissions (permission_key, resource, action) VALUES
  ('seeding.manage', 'seeding', 'manage'),
  ('seeding.execute', 'seeding', 'execute')
ON CONFLICT (permission_key) DO NOTHING;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'seeding_%' ORDER BY table_name;
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename LIKE 'seeding_%';
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'seeding_%' AND relkind = 'r';
-- SELECT permission_key FROM permissions WHERE resource = 'seeding';
-- Expect zero rows until an Owner/Admin grants them via the Permission Matrix UI:
-- SELECT r.role_key, p.permission_key FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id WHERE p.resource = 'seeding';
