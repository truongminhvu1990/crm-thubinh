-- Seeding Execution Operations (Phase 2K-E) — execution accounts (real
-- Facebook identities staff manually operate) and destinations (Groups to
-- post into), plus the two additive columns on seeding_tasks that tie a
-- generated task to both.
--
-- Architecture C (locked Phase 2K-B/C/D): no seeding_runs, no batch/
-- distribution-event table, no persisted preview state. The only
-- persisted output of a distribution operation is the seeding_tasks rows
-- it creates plus one existing-shape activity_logs entry — both already
-- supported by existing schema, neither touched here.
--
-- No credentials of any kind: no access_token, no password, no cookie, no
-- browser-profile secret. This module coordinates human use of real
-- accounts; it never authenticates as them (facebookGraphClient.ts's own
-- "no browser automation, no personal-account session" invariant, applied
-- again here, not modified).
--
-- Non-destructive throughout: no column dropped, no row deleted, no
-- backfill required. facebook_pages, facebook_page_posts,
-- facebook_manual_content_references, facebook_content_index,
-- seeding_campaign_targets (schema + trigger), and activity_logs are all
-- completely UNTOUCHED by this migration.

BEGIN;

-- ============================================================
-- 1. seeding_execution_accounts — a real Facebook identity staff may
--    manually operate. Independent of `staff`: an account is a shared
--    company resource, not a person's employment identity (2K-A/B
--    finding — the business explicitly rotates 2-3 accounts across
--    however many staff perform seeding).
-- ============================================================

CREATE TABLE IF NOT EXISTS seeding_execution_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  display_name text NOT NULL,

  -- Free text, app-validated (lib/seeding/seeding.constants.ts) — same
  -- "extensible enum, no CHECK" convention as seeding_campaigns.status.
  status text NOT NULL DEFAULT 'Active',

  -- Mutable DEFAULT-OPERATOR suggestion only, never an exclusivity lock —
  -- one account may be used by different staff over time (2K-A finding).
  -- A generated task's own assigned_staff_id is a separate, frozen value
  -- (see seeding_tasks below), never a live read of this column.
  assigned_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seeding_execution_accounts_status ON seeding_execution_accounts(status);
CREATE INDEX IF NOT EXISTS idx_seeding_execution_accounts_staff ON seeding_execution_accounts(assigned_staff_id);

DROP TRIGGER IF EXISTS seeding_execution_accounts_set_updated_at ON seeding_execution_accounts;
CREATE TRIGGER seeding_execution_accounts_set_updated_at
BEFORE UPDATE ON seeding_execution_accounts
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE seeding_execution_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON seeding_execution_accounts;
CREATE POLICY "Allow full access to anon" ON seeding_execution_accounts
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON seeding_execution_accounts;
CREATE POLICY "Allow full access to authenticated" ON seeding_execution_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2. seeding_destinations — a place (Facebook Group today) work can be
--    distributed into. Deliberately NOT content: no message/
--    full_picture_url/discovery_method — a destination is where to post,
--    never what already exists there (the exact distinction Phase 2J-D's
--    facebook_manual_content_references draws for imported content, kept
--    intact and un-conflated here).
-- ============================================================

CREATE TABLE IF NOT EXISTS seeding_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  label text NOT NULL,

  -- Free text, extensible — 'Facebook' today, same convention as
  -- facebook_manual_content_references.source_type.
  platform text NOT NULL DEFAULT 'Facebook',
  destination_type text NOT NULL DEFAULT 'Group',

  -- The exact URL as pasted, byte-for-byte, never rewritten.
  permalink_url text NOT NULL,

  -- The normalized, stable Group id — extracted by
  -- lib/facebookTools/facebookUrlParser.ts's parseFacebookGroupDestinationUrl,
  -- NEVER a post id (a destination is the Group itself, not any specific
  -- post inside it — this is the dedup identity, not permalink_url,
  -- mirroring facebook_manual_content_references.facebook_object_id).
  external_group_id text NOT NULL,

  status text NOT NULL DEFAULT 'Active',

  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seeding_destinations_external_group_id
  ON seeding_destinations(external_group_id);
CREATE INDEX IF NOT EXISTS idx_seeding_destinations_status ON seeding_destinations(status);

DROP TRIGGER IF EXISTS seeding_destinations_set_updated_at ON seeding_destinations;
CREATE TRIGGER seeding_destinations_set_updated_at
BEFORE UPDATE ON seeding_destinations
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE seeding_destinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON seeding_destinations;
CREATE POLICY "Allow full access to anon" ON seeding_destinations
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON seeding_destinations;
CREATE POLICY "Allow full access to authenticated" ON seeding_destinations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3. seeding_tasks — two additive nullable columns. NOT an exclusive-arc
--    pair with each other or with campaign_target_id: a distribution task
--    has BOTH content (campaign_target_id, unchanged meaning) AND a
--    destination; execution_account_id and destination_id are simply
--    null for the pre-existing engagement-task shape (Like/Comment on an
--    already-existing post). ON DELETE SET NULL matches every other
--    resource FK in this schema (assigned_staff_id, imported_by_staff_id,
--    connected_by_staff_id) — the primary safeguard against losing
--    historical traceability is that accounts/destinations are meant to
--    be deactivated, never deleted, not this FK action.
-- ============================================================

ALTER TABLE seeding_tasks
  ADD COLUMN IF NOT EXISTS execution_account_id uuid REFERENCES seeding_execution_accounts(id) ON DELETE SET NULL;

ALTER TABLE seeding_tasks
  ADD COLUMN IF NOT EXISTS destination_id uuid REFERENCES seeding_destinations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_seeding_tasks_execution_account ON seeding_tasks(execution_account_id);
CREATE INDEX IF NOT EXISTS idx_seeding_tasks_destination ON seeding_tasks(destination_id);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('seeding_execution_accounts', 'seeding_destinations');
-- SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'seeding_tasks' AND column_name IN ('execution_account_id', 'destination_id') ORDER BY column_name;
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename IN ('seeding_execution_accounts', 'seeding_destinations');
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('seeding_execution_accounts', 'seeding_destinations', 'seeding_tasks') AND indexname LIKE '%execution_account%' OR indexname LIKE '%destination%';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'facebook_pages';  -- confirm untouched
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'facebook_page_posts';  -- confirm untouched
