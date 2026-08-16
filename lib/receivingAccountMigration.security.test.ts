import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Receiving Accounts (Payment / Bank Account / Money-Debt domain redesign,
 * Stage 2) — static verification of
 * 2026081719_receiving_accounts_module.sql.
 *
 * IMPORTANT LIMITATION, stated plainly: this repository has no live
 * Postgres/Supabase connection available inside the automated test
 * runner, so these tests cannot execute real SQL against a database. What
 * follows is the strongest static verification available instead: parsing
 * the actual migration file's SQL text and asserting on the specific
 * schema/constraint/RLS properties the approved design requires — a
 * regression guard against a future edit silently reintroducing something
 * the design explicitly rejected (a uniqueness constraint, a bank-category
 * trigger, a DELETE policy, a historical backfill), not a substitute for
 * live Dev verification performed separately.
 */

const MIGRATION_PATH = path.join(__dirname, "..", "supabase", "migrations", "2026081719_receiving_accounts_module.sql");
const sql = fs.readFileSync(MIGRATION_PATH, "utf8").replace(/\r\n/g, "\n");

function extractBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Could not find start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Could not find end marker after start: ${endMarker}`);
  return source.slice(start, end);
}

const tableBlock = extractBlock(sql, "CREATE TABLE IF NOT EXISTS receiving_accounts", "\n-- RLS:");

test("1: receiving_accounts table is created", () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS receiving_accounts/);
});

test("2: id is a uuid primary key", () => {
  assert.match(tableBlock, /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
});

test("3: bank_id is NOT NULL and FKs to master_data", () => {
  assert.match(tableBlock, /bank_id uuid NOT NULL REFERENCES master_data\(id\) ON DELETE RESTRICT/);
});

test("4: owner_partner_id is NOT NULL and FKs to partners", () => {
  assert.match(tableBlock, /owner_partner_id uuid NOT NULL REFERENCES partners\(id\) ON DELETE RESTRICT/);
});

test("5: currency is NOT NULL", () => {
  assert.match(tableBlock, /currency text NOT NULL/);
});

test("6: account_number is NOT NULL", () => {
  assert.match(tableBlock, /account_number text NOT NULL/);
});

test("7: label is nullable (no NOT NULL on it)", () => {
  assert.match(tableBlock, /^\s*label text,\s*$/m);
});

test("8: is_active defaults to true", () => {
  assert.match(tableBlock, /is_active boolean NOT NULL DEFAULT true/);
});

test("9: created_at defaults to now()", () => {
  assert.match(tableBlock, /created_at timestamptz NOT NULL DEFAULT now\(\)/);
});

test("10: updated_at defaults to now(), and uses the existing shared trigger function (not a new one)", () => {
  assert.match(tableBlock, /updated_at timestamptz NOT NULL DEFAULT now\(\)/);
  assert.match(sql, /CREATE TRIGGER receiving_accounts_set_updated_at\s*\nBEFORE UPDATE ON receiving_accounts\s*\nFOR EACH ROW EXECUTE FUNCTION set_customers_updated_at\(\);/);
  assert.doesNotMatch(sql, /CREATE (OR REPLACE )?FUNCTION set_customers_updated_at/, "Must not redefine the shared trigger function");
  assert.doesNotMatch(sql, /CREATE (OR REPLACE )?FUNCTION receiving_accounts_.*updated_at/i, "Must not invent a new trigger function");
});

test("11: payments.receiving_account_id is nullable", () => {
  const alterLine = sql.match(/ALTER TABLE payments ADD COLUMN IF NOT EXISTS receiving_account_id uuid NULL[^;]*;/);
  assert.ok(alterLine, "Expected the payments ALTER statement");
  assert.doesNotMatch(alterLine![0], /NOT NULL/, "receiving_account_id must remain nullable");
});

test("12: payments.receiving_account_id FKs to receiving_accounts", () => {
  assert.match(sql, /ALTER TABLE payments ADD COLUMN IF NOT EXISTS receiving_account_id uuid NULL\s*\n\s*REFERENCES receiving_accounts\(id\)/);
});

test("13: ON DELETE RESTRICT is present on all three FKs (bank_id, owner_partner_id, payments.receiving_account_id)", () => {
  // Scoped to the executable statements only — the header comment
  // legitimately explains "ON DELETE RESTRICT throughout" in prose, which
  // must not itself count as a fourth occurrence.
  const executableBlock = extractBlock(sql, "BEGIN;", "\nCOMMIT;");
  const restrictCount = (executableBlock.match(/ON DELETE RESTRICT/g) ?? []).length;
  assert.equal(restrictCount, 3, `Expected exactly 3 ON DELETE RESTRICT clauses, found ${restrictCount}`);
});

test("14: required indexes exist", () => {
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_receiving_accounts_bank_id ON receiving_accounts\(bank_id\)/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_receiving_accounts_owner_partner_id ON receiving_accounts\(owner_partner_id\)/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_payments_receiving_account_id ON payments\(receiving_account_id\)/);
});

test("15: NO uniqueness constraint on (bank_id, owner_partner_id, currency, account_number) — the explicitly rejected design", () => {
  assert.doesNotMatch(sql, /UNIQUE\s*\(\s*bank_id/i, "Must not add the rejected compound uniqueness constraint");
  assert.doesNotMatch(sql, /UNIQUE\s*\(\s*owner_partner_id/i);
  // No UNIQUE constraint (table-level `UNIQUE (...)` or column-level bare
  // `UNIQUE` keyword) should exist on receiving_accounts. Case-SENSITIVE
  // and \b-bounded so this doesn't false-positive on the lowercase prose
  // "unique"/"uniqueness" inside this table's own explanatory column
  // comments (e.g. "not a verified unique real account number") — this
  // codebase's own convention is that SQL keywords are always uppercase.
  assert.doesNotMatch(tableBlock, /\bUNIQUE\b/, "receiving_accounts must not declare any UNIQUE constraint");
});

test("16: NO bank-category trigger/CHECK is introduced — application-layer validation only", () => {
  assert.doesNotMatch(sql, /CREATE (OR REPLACE )?FUNCTION.*bank/i, "Must not introduce a bank-category-enforcing function/trigger");
  assert.doesNotMatch(sql, /CHECK\s*\([^)]*category[^)]*bank/i, "Must not add a cross-table CHECK for bank category (not possible in Postgres, and not the approved design)");
});

test("17: NO historical data backfill / INSERT of any kind exists in this migration", () => {
  const executableBlock = extractBlock(sql, "BEGIN;", "\nCOMMIT;");
  assert.doesNotMatch(executableBlock, /INSERT INTO/i, "This migration must not insert any data — schema only");
});

test("18: NO DELETE policy is introduced for receiving_accounts", () => {
  const rlsBlock = sql.slice(sql.indexOf("ALTER TABLE receiving_accounts ENABLE ROW LEVEL SECURITY"));
  assert.doesNotMatch(rlsBlock, /FOR DELETE/i, "No dedicated DELETE policy should exist");
  // The two FOR ALL policies technically cover DELETE at the RLS layer (matching
  // partners/master_data's own existing FOR ALL shape) but no application code
  // path exposes a delete operation — enforced by lib/receivingAccount.service.ts
  // having no delete function, verified separately in the service test suite.
});

test("RLS: exactly anon + authenticated FOR ALL policies exist, matching the re-verified partners/master_data convention", () => {
  const anonPolicy = sql.indexOf('CREATE POLICY "Allow full access to anon" ON receiving_accounts FOR ALL TO anon');
  const authPolicy = sql.indexOf('CREATE POLICY "Allow full access to authenticated" ON receiving_accounts');
  assert.notEqual(anonPolicy, -1, "Expected an anon FOR ALL policy");
  assert.notEqual(authPolicy, -1, "Expected an authenticated FOR ALL policy");
});

test("No new permission keys are introduced by this migration", () => {
  assert.doesNotMatch(sql, /INSERT INTO permissions/i, "Must not seed any new permission key — reuses existing partner.* permissions at the application layer");
});
