-- Knowledge Vault module - one new table, per docs/KNOWLEDGE_VAULT_SPEC.md
-- (Revision 2, LOCKED), docs/KNOWLEDGE_VAULT_UI.md (Revision 2, LOCKED),
-- docs/KNOWLEDGE_VAULT_DATABASE.md (Revision 2, LOCKED), and
-- docs/KNOWLEDGE_VAULT_MIGRATION.md (Revision 1, LOCKED). Purely additive -
-- no existing table is touched.
--
-- Explicit requirements from this task, all honored below:
--   No ENUM, no FK, no CHECK, no RLS, no CRM references, database
--   maintains last_updated, no seed data.

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  body text NOT NULL,
  tags text,
  last_updated timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'Active'
);

-- last_updated is database-maintained, not application-set (no write path
-- exists in the app at all - KNOWLEDGE_VAULT_SPEC.md Decision 2). Defaults
-- to now() on insert (above); this trigger keeps it current on every
-- update made directly against the table (e.g. by a future seed/import
-- process, per KNOWLEDGE_VAULT_DATABASE.md Decision 7). A dedicated
-- function is used rather than reusing set_customers_updated_at(), which
-- is hardcoded to NEW.updated_at, not this table's last_updated column.
CREATE OR REPLACE FUNCTION set_knowledge_entries_last_updated()
RETURNS trigger AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS knowledge_entries_set_last_updated ON knowledge_entries;
CREATE TRIGGER knowledge_entries_set_last_updated
BEFORE UPDATE ON knowledge_entries
FOR EACH ROW EXECUTE FUNCTION set_knowledge_entries_last_updated();

-- No ENUM type, no CHECK constraint, no Foreign Key, no RLS/policy, and no
-- seed data - all explicit requirements for this migration. Category and
-- Status are validated by the application only (KNOWLEDGE_VAULT_DATABASE.md
-- Decision 1, extended to Status per this task). RLS is deliberately left
-- untouched (no ALTER TABLE ... ENABLE ROW LEVEL SECURITY, no CREATE
-- POLICY anywhere in this file) - flagged in this migration's Self Review
-- for what that means given this project's documented RLS-on-new-tables
-- default behavior.
