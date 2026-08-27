-- Facebook Manual Content References (Phase 2J-D) — Personal/Group Facebook
-- content the CRM has no API access to discover (Meta's Groups API was
-- removed for third-party apps in 2024; Personal-account post listing is
-- not an approved use case for this product — see Phase 2J-A/2J-B research).
-- Captured instead by a manager pasting a permalink URL.
--
-- Architecture B (approved Phase 2J-C, superseding the earlier synthetic-
-- Page-row proposal from Phase 2J-B): this content is NOT stored as a fake
-- Page/fake facebook_pages row. facebook_pages and facebook_page_posts —
-- their columns, constraints, OAuth semantics, RLS, and every existing
-- query against them — are completely UNTOUCHED by this migration. No
-- ALTER TABLE against either appears anywhere below.
--
-- Non-destructive throughout: no column dropped, no row deleted, no
-- backfill required (every NOT NULL relaxed below already has 100% of its
-- existing rows non-null, since this only opens a path for *new* rows).

BEGIN;

-- ============================================================
-- 1. facebook_manual_content_references — fully independent of
--    facebook_pages; a manual reference has no Page relationship at all.
-- ============================================================

CREATE TABLE IF NOT EXISTS facebook_manual_content_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'Personal' | 'Group' today. Free text + app-layer validation
  -- (lib/facebookTools/facebookUrlParser.ts), matching this same module's
  -- own established convention for extensible enums (seeding_tasks.
  -- action_type, seeding_campaigns.objective) rather than a CHECK — so a
  -- future third value (e.g. a mobile Share-Sheet-specific type) needs no
  -- migration.
  source_type text NOT NULL,
  -- Manager-entered free text for their own reference (a Group's name,
  -- "Cá nhân", etc.) — never validated against Facebook, never required.
  source_label text,

  -- Stable Facebook object id, parsed from the URL by
  -- facebookUrlParser.ts — NEVER guessed or hashed from the URL text. This
  -- is the dedup identity (unique index below), not permalink_url.
  facebook_object_id text NOT NULL,

  -- The exact URL as pasted, byte-for-byte, never rewritten/normalized.
  permalink_url text NOT NULL,

  -- Honest content fields: NULL unless genuinely retrieved. In this phase
  -- they are always NULL (no token exists that can read Personal/Group
  -- content) — kept as real nullable columns, not omitted, so a future
  -- narrow API pilot (Phase 2J-A §7) could populate them with zero schema
  -- change.
  message text,
  full_picture_url text,

  -- Always 'Manual Import' in this phase. A real column, not a hardcoded
  -- constant, so a future capture method (e.g. mobile Share Sheet) is an
  -- additive value, never a schema change.
  discovery_method text NOT NULL DEFAULT 'Manual Import',

  imported_by_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_facebook_manual_content_references_object_id
  ON facebook_manual_content_references(facebook_object_id);

DROP TRIGGER IF EXISTS facebook_manual_content_references_set_updated_at ON facebook_manual_content_references;
CREATE TRIGGER facebook_manual_content_references_set_updated_at
BEFORE UPDATE ON facebook_manual_content_references
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE facebook_manual_content_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON facebook_manual_content_references;
CREATE POLICY "Allow full access to anon" ON facebook_manual_content_references
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON facebook_manual_content_references;
CREATE POLICY "Allow full access to authenticated" ON facebook_manual_content_references
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2. facebook_content_index — read-only unified browsing layer for
--    Content Repository. NEVER a write path (no INSERT/UPDATE/DELETE is
--    ever issued against this view anywhere in the application).
--    facebook_pages / facebook_page_posts are read here, not altered.
-- ============================================================

CREATE OR REPLACE VIEW facebook_content_index AS
  SELECT
    p.id,
    'Page'::text AS source_type,
    pg.page_name AS source_label,
    p.message,
    p.permalink_url,
    p.full_picture_url,
    p.discovery_status,
    p.published_at,
    p.last_synced_at AS discovered_at,
    'API Sync'::text AS discovery_method,
    p.facebook_page_id AS owning_page_id
  FROM facebook_page_posts p
  JOIN facebook_pages pg ON pg.facebook_page_id = p.facebook_page_id
  UNION ALL
  SELECT
    m.id,
    m.source_type,
    m.source_label,
    m.message,
    m.permalink_url,
    m.full_picture_url,
    'Active'::text AS discovery_status,
    m.created_at AS published_at,
    m.created_at AS discovered_at,
    m.discovery_method,
    NULL::text AS owning_page_id
  FROM facebook_manual_content_references m;

GRANT SELECT ON facebook_content_index TO anon, authenticated;

-- ============================================================
-- 3. seeding_campaign_targets — exclusive-arc: exactly one of
--    facebook_page_post_id / manual_content_reference_id is ever set.
--    Real FK enforcement kept on BOTH arms (not a polymorphic/untyped
--    target_type+target_id pair — this is the standard, referentially-
--    safe "optional FK pair + CHECK" pattern).
-- ============================================================

ALTER TABLE seeding_campaign_targets
  ALTER COLUMN facebook_page_post_id DROP NOT NULL;

ALTER TABLE seeding_campaign_targets
  ADD COLUMN IF NOT EXISTS manual_content_reference_id uuid REFERENCES facebook_manual_content_references(id) ON DELETE CASCADE;

ALTER TABLE seeding_campaign_targets
  ADD CONSTRAINT seeding_campaign_targets_exactly_one_source
    CHECK ((facebook_page_post_id IS NOT NULL) <> (manual_content_reference_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_seeding_campaign_targets_manual_content
  ON seeding_campaign_targets(manual_content_reference_id);

-- ============================================================
-- 4. seeding_campaign_targets_check_page() — ONE early-return line added.
--    Every other line is byte-for-byte identical to 2026082601's original
--    definition — this is not a rewrite, and Page-backed targets take the
--    exact same code path they always did.
-- ============================================================

CREATE OR REPLACE FUNCTION seeding_campaign_targets_check_page() RETURNS trigger AS $$
DECLARE
  campaign_page text;
  post_page text;
BEGIN
  IF NEW.facebook_page_post_id IS NULL THEN
    RETURN NEW; -- manual-reference target: no Page relationship to validate
  END IF;

  SELECT facebook_page_id INTO campaign_page FROM seeding_campaigns WHERE id = NEW.campaign_id;
  SELECT facebook_page_id INTO post_page FROM facebook_page_posts WHERE id = NEW.facebook_page_post_id;
  IF campaign_page IS DISTINCT FROM post_page THEN
    RAISE EXCEPTION 'seeding_campaign_targets: post % belongs to a different Facebook Page than campaign %', NEW.facebook_page_post_id, NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. seeding_campaigns.facebook_page_id — relaxed so a manual-only
--    campaign can exist without inventing a fake Page. Safe: every
--    existing row already has a non-null value (this only opens the path
--    for NEW rows) — no backfill.
-- ============================================================

ALTER TABLE seeding_campaigns ALTER COLUMN facebook_page_id DROP NOT NULL;

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'facebook_manual_content_references';
-- SELECT table_name FROM information_schema.views WHERE table_name = 'facebook_content_index';
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename = 'facebook_manual_content_references';
-- SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'seeding_campaign_targets' AND column_name IN ('facebook_page_post_id','manual_content_reference_id') ORDER BY column_name;
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'seeding_campaign_targets'::regclass AND contype = 'c';
-- SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'seeding_campaigns' AND column_name = 'facebook_page_id';
-- SELECT prosrc FROM pg_proc WHERE proname = 'seeding_campaign_targets_check_page';
-- SELECT has_table_privilege('anon', 'facebook_content_index', 'SELECT'), has_table_privilege('authenticated', 'facebook_content_index', 'SELECT');
