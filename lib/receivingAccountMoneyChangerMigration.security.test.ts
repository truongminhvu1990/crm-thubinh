import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Receiving Account ↔ Money Changer Association (Payment / Bank Account /
 * Money-Debt domain redesign, Stage 5, Product Owner Locked Decisions
 * 2026-08-16) — static verification of
 * 2026081720_receiving_account_money_changer_association.sql.
 *
 * Same limitation/purpose as receivingAccountMigration.security.test.ts
 * (Stage 2's own security test): no live Postgres connection inside the
 * automated test runner, so this parses the actual migration file's SQL
 * text and asserts on the specific properties the Locked Decisions require
 * — a regression guard against a future edit silently reintroducing a
 * CHECK constraint tying this column to partner_type (explicitly rejected,
 * Phase 1), changing the ON DELETE behavior away from SET NULL (Decision
 * 7), or touching any of the columns/tables/functions this migration is
 * required to leave alone (owner_partner_id, bank_id, currency,
 * account_number, payment_method, money_debt_ledger_entries,
 * create_money_debt_ledger_entry, create_buy_cny_ledger_transaction). Live
 * Dev verification (column exists, confdeltype='n', index exists) was
 * performed separately this same session.
 */

const MIGRATION_PATH = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "2026081720_receiving_account_money_changer_association.sql"
);
const sql = fs.readFileSync(MIGRATION_PATH, "utf8").replace(/\r\n/g, "\n");
/** Comment-stripped view — the file's own doc comments legitimately discuss
 * "CHECK constraint" and "money_debt_ledger_entries" in prose (explaining
 * what this migration deliberately does NOT do); tests 4/7 must inspect
 * only the actual executable SQL, not the prose explaining its absence. */
const executableSql = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

test("1: adds exactly one new column, money_changer_partner_id, nullable uuid", () => {
  assert.match(sql, /ALTER TABLE receiving_accounts\s+ADD COLUMN money_changer_partner_id uuid NULL/);
});

test("2: money_changer_partner_id references partners(id)", () => {
  assert.match(sql, /money_changer_partner_id uuid NULL REFERENCES partners\(id\)/);
});

test("3: ON DELETE SET NULL (Decision 7) — not RESTRICT, not CASCADE", () => {
  assert.match(sql, /money_changer_partner_id uuid NULL REFERENCES partners\(id\) ON DELETE SET NULL/);
});

test("4: no CHECK constraint anywhere in this migration's executable SQL ties the column to partner_type", () => {
  assert.doesNotMatch(executableSql, /CHECK/i);
});

test("5: exactly one ALTER TABLE statement in the whole migration, and it is the money_changer_partner_id ADD COLUMN", () => {
  const alterStatements = sql.match(/ALTER TABLE \w+/g) ?? [];
  assert.deepEqual(alterStatements, ["ALTER TABLE receiving_accounts"]);
  assert.doesNotMatch(sql, /\bALTER COLUMN\b/i);
  assert.doesNotMatch(sql, /\bDROP COLUMN\b/i);
});

test("6: no ALTER TABLE against payments.payment_method", () => {
  assert.doesNotMatch(sql, /ALTER TABLE payments/);
});

test("7: does not touch money_debt_ledger_entries in this migration's executable SQL", () => {
  assert.doesNotMatch(executableSql, /money_debt_ledger_entries/);
});

test("8: does not redefine either existing Money/Debt Ledger write function", () => {
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION create_money_debt_ledger_entry/);
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION create_buy_cny_ledger_transaction/);
});

test("9: adds an index on the new column", () => {
  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS idx_receiving_accounts_money_changer_partner_id\s+ON receiving_accounts\(money_changer_partner_id\)/
  );
});

test("10: no DROP TABLE / DROP COLUMN / TRUNCATE anywhere (no historical backfill or destructive statement)", () => {
  assert.doesNotMatch(sql, /DROP TABLE/i);
  assert.doesNotMatch(sql, /DROP COLUMN/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("11: no UPDATE/INSERT statement against receiving_accounts, partners, or payments (no data write, schema-only migration)", () => {
  assert.doesNotMatch(sql, /INSERT INTO receiving_accounts/i);
  assert.doesNotMatch(sql, /UPDATE receiving_accounts/i);
  assert.doesNotMatch(sql, /INSERT INTO partners/i);
  assert.doesNotMatch(sql, /UPDATE partners/i);
  assert.doesNotMatch(sql, /INSERT INTO payments/i);
  assert.doesNotMatch(sql, /UPDATE payments/i);
});

test("12: wrapped in a single explicit transaction (BEGIN...COMMIT)", () => {
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});
