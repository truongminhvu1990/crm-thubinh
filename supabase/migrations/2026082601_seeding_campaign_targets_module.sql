-- Seeding Campaign Management (Phase 2C) — multi-target campaigns.
-- 1 Campaign -> many Target Posts (seeding_campaign_targets, each a real
-- cached Facebook Page post) -> many Tasks (Like/Comment/Share).
-- Replaces the old assumption that a Campaign targets exactly one post.
--
-- Non-destructive throughout: no column dropped, no row deleted. Verified
-- on Dev before writing this migration: seeding_campaigns/seeding_tasks/
-- seeding_comment_suggestions all have 0 rows — but every change below is
-- written to be safe regardless (nullable/defaulted, not assumed empty).
--
-- Comment Shield / facebook_live_posts / facebook_page_posts / Phase 2A-2B
-- are not touched by this migration.

BEGIN;

-- ============================================================
-- 1. seeding_campaigns — facebook_post_id no longer required
-- ============================================================

ALTER TABLE seeding_campaigns ALTER COLUMN facebook_post_id DROP NOT NULL;

-- ============================================================
-- 2. seeding_campaign_targets — the new junction table
-- ============================================================

CREATE TABLE IF NOT EXISTS seeding_campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  campaign_id uuid NOT NULL REFERENCES seeding_campaigns(id) ON DELETE CASCADE,
  facebook_page_post_id uuid NOT NULL REFERENCES facebook_page_posts(id) ON DELETE CASCADE,

  -- Snapshot of Facebook's own post id (immutable natural identity) — used
  -- for task display/permalink derivation without always needing the join.
  facebook_post_id text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seeding_campaign_targets_campaign_post
  ON seeding_campaign_targets(campaign_id, facebook_page_post_id);
CREATE INDEX IF NOT EXISTS idx_seeding_campaign_targets_campaign ON seeding_campaign_targets(campaign_id);

DROP TRIGGER IF EXISTS seeding_campaign_targets_set_updated_at ON seeding_campaign_targets;
CREATE TRIGGER seeding_campaign_targets_set_updated_at
BEFORE UPDATE ON seeding_campaign_targets
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

-- Cross-Page integrity: a target's post must belong to the same Facebook
-- Page as its campaign. A CHECK constraint can't reference another table,
-- so this uses a BEFORE INSERT/UPDATE trigger — triggers are already an
-- established pattern in this schema (every *_set_updated_at trigger).
CREATE OR REPLACE FUNCTION seeding_campaign_targets_check_page() RETURNS trigger AS $$
DECLARE
  campaign_page text;
  post_page text;
BEGIN
  SELECT facebook_page_id INTO campaign_page FROM seeding_campaigns WHERE id = NEW.campaign_id;
  SELECT facebook_page_id INTO post_page FROM facebook_page_posts WHERE id = NEW.facebook_page_post_id;
  IF campaign_page IS DISTINCT FROM post_page THEN
    RAISE EXCEPTION 'seeding_campaign_targets: post % belongs to a different Facebook Page than campaign %', NEW.facebook_page_post_id, NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS seeding_campaign_targets_check_page_trigger ON seeding_campaign_targets;
CREATE TRIGGER seeding_campaign_targets_check_page_trigger
BEFORE INSERT OR UPDATE ON seeding_campaign_targets
FOR EACH ROW EXECUTE FUNCTION seeding_campaign_targets_check_page();

ALTER TABLE seeding_campaign_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON seeding_campaign_targets;
CREATE POLICY "Allow full access to anon" ON seeding_campaign_targets
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON seeding_campaign_targets;
CREATE POLICY "Allow full access to authenticated" ON seeding_campaign_targets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3. seeding_tasks — target-specific, action-typed
-- ============================================================

ALTER TABLE seeding_tasks ADD COLUMN IF NOT EXISTS campaign_target_id uuid REFERENCES seeding_campaign_targets(id) ON DELETE CASCADE;
-- Nullable: a legacy task (none exist today, but never assumed) keeps
-- working without one. Every new task always sets it — enforced in
-- lib/seeding/seedingTask.service.ts, not this column's own constraint.

ALTER TABLE seeding_tasks ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'Comment';
-- DEFAULT 'Comment' matches the only kind of task this table supported
-- before this migration, so any pre-existing row reads back correctly.

ALTER TABLE seeding_tasks ALTER COLUMN comment_text DROP NOT NULL;
-- Like/Share tasks need none. "Required when action_type = Comment" is
-- enforced at the application layer (seedingTask.service.ts), consistent
-- with this table never having had a CHECK constraint.

CREATE INDEX IF NOT EXISTS idx_seeding_tasks_campaign_target ON seeding_tasks(campaign_target_id);

-- campaign_id and facebook_post_id are UNCHANGED (kept NOT NULL / as they
-- were) — campaign_id stays populated (denormalized from the target) for
-- backward-compat query convenience, per PO decision.

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'seeding_campaign_targets';
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename = 'seeding_campaign_targets';
-- SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'seeding_campaigns' AND column_name = 'facebook_post_id';
-- SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'seeding_tasks' AND column_name IN ('campaign_target_id','action_type','comment_text') ORDER BY column_name;
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'seeding_campaign_targets'::regclass AND NOT tgisinternal;
