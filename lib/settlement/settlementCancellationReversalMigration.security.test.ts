import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Settlement Cancellation Reversal (Finance Project #1, Phase B) — static
 * verification of 2026082102_settlement_cancellation_reversal.sql.
 *
 * Same limitation as settlementPaidMigration.security.test.ts (no live
 * Postgres/Supabase connection in the automated test runner): this parses
 * the actual migration file's SQL text and asserts on the specific
 * REVOKE/GRANT/RLS/state-machine/cascade properties that determine the
 * real guarantees if applied exactly as written — a regression guard, not
 * a substitute for the migration's own "Manual ... check" comments run
 * live on Dev.
 */

const MIGRATION_PATH = path.join(__dirname, "..", "..", "supabase", "migrations", "2026082102_settlement_cancellation_reversal.sql");
const sql = fs.readFileSync(MIGRATION_PATH, "utf8");

function extractBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Could not find start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Could not find end marker after start: ${endMarker}`);
  return source.slice(start, end);
}

test("SCHEMA PROTECTION (static): this migration never touches orders, payments, money_debt_ledger_entries, operating_expenses, or sales_commissions", () => {
  for (const table of ["orders", "payments", "money_debt_ledger_entries", "operating_expenses", "sales_commissions"]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`ALTER TABLE ${table}\\b|CREATE TABLE ${table}\\b`, "i"),
      `Product Owner Schema Protection: must not ALTER/CREATE ${table}`
    );
  }
});

test("NO NEW LEDGER (static): no new table is created — only an additive column on the existing settlement_items junction", () => {
  assert.doesNotMatch(sql, /CREATE TABLE/i, "must not create any new table");
  assert.match(sql, /ALTER TABLE settlement_items ADD COLUMN IF NOT EXISTS is_active/, "must add is_active to the existing settlement_items table");
});

test("INTEGRITY (static): the old system-wide UNIQUE(compensation_id) is dropped and replaced with a partial unique index scoped to is_active", () => {
  assert.match(sql, /ALTER TABLE settlement_items DROP CONSTRAINT IF EXISTS settlement_items_compensation_id_key/, "must drop the old full-table UNIQUE constraint");
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS settlement_items_compensation_id_active_key\s*\n\s*ON settlement_items\(compensation_id\) WHERE is_active/,
    "must create a partial unique index scoped to is_active — the mechanism that lets a recovered Compensation be claimed again"
  );
});

test("SECURITY (static): cancel_settlement_with_reversal is revoked from PUBLIC/anon/authenticated and granted only to service_role", () => {
  const revokeIndex = sql.indexOf("REVOKE ALL ON FUNCTION cancel_settlement_with_reversal(");
  assert.notEqual(revokeIndex, -1, "Expected a REVOKE ALL for cancel_settlement_with_reversal");
  const revokeStatement = sql.slice(revokeIndex, sql.indexOf(";", revokeIndex) + 1);
  assert.match(revokeStatement, /FROM PUBLIC, anon, authenticated/, "REVOKE must explicitly name PUBLIC, anon, AND authenticated");

  const grantIndex = sql.indexOf("GRANT EXECUTE ON FUNCTION cancel_settlement_with_reversal(");
  assert.notEqual(grantIndex, -1, "Expected a GRANT EXECUTE for cancel_settlement_with_reversal");
  const grantStatement = sql.slice(grantIndex, sql.indexOf(";", grantIndex) + 1);
  assert.doesNotMatch(grantStatement, /\banon\b/, "GRANT must not name anon");
  assert.doesNotMatch(grantStatement, /\bauthenticated\b/, "GRANT must not name authenticated");
  assert.match(grantStatement, /\bservice_role\b/, "GRANT must target service_role");
});

test("SECURITY (static): cancel_settlement_with_reversal requires a non-null, staff-verified p_staff_id and checks settlement_staff_has_permission before any write", () => {
  const body = extractBlock(sql, "CREATE OR REPLACE FUNCTION cancel_settlement_with_reversal(", "\n$$;");
  const nullCheckIndex = body.indexOf("IF p_staff_id IS NULL THEN");
  const existsCheckIndex = body.indexOf("IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_staff_id)");
  const permCheckIndex = body.indexOf("settlement_staff_has_permission(p_staff_id, 'settlement.manage')");
  const firstUpdateIndex = body.indexOf("UPDATE settlements");

  assert.notEqual(nullCheckIndex, -1, "must reject a NULL p_staff_id");
  assert.notEqual(existsCheckIndex, -1, "must verify p_staff_id corresponds to a real staff row");
  assert.notEqual(permCheckIndex, -1, "must check settlement_staff_has_permission(p_staff_id, 'settlement.manage')");
  assert.notEqual(firstUpdateIndex, -1, "must contain an UPDATE settlements statement");
  assert.ok(
    nullCheckIndex < firstUpdateIndex && existsCheckIndex < firstUpdateIndex && permCheckIndex < firstUpdateIndex,
    "all three authorization checks must run BEFORE the settlements UPDATE"
  );
});

test("STATE MACHINE (static): only Draft/Pending/Approved may be cancelled — the guard runs before any write, so double-cancellation and cancelling a Completed/Paid settlement are both rejected before touching anything", () => {
  const body = extractBlock(sql, "CREATE OR REPLACE FUNCTION cancel_settlement_with_reversal(", "\n$$;");
  const statusCheckIndex = body.indexOf("IF v_status NOT IN ('Draft', 'Pending', 'Approved') THEN");
  const firstUpdateIndex = body.indexOf("UPDATE settlements");
  assert.notEqual(statusCheckIndex, -1, "must reject any status other than Draft/Pending/Approved");
  assert.ok(statusCheckIndex < firstUpdateIndex, "the status check must run before the UPDATE — this is what makes a second cancel attempt safe/idempotent");
  assert.doesNotMatch(body, /'Completed'.*NOT IN|IN \([^)]*'Completed'/i, "Completed must never be an accepted status for cancellation");
});

test("PAID PROTECTION (static): the reversal cascade is scoped to compensations still 'Handed Off' — a Paid compensation can never match", () => {
  const body = extractBlock(sql, "CREATE OR REPLACE FUNCTION cancel_settlement_with_reversal(", "\n$$;");
  assert.match(body, /AND c\.status = 'Handed Off'/, "the cascade's WHERE clause must scope strictly to Handed Off — never Paid");
  assert.doesNotMatch(body, /status = 'Paid'/, "must never write or match against status='Paid' anywhere in this function");
});

test("CASCADE (static): reverts every active member Compensation still Handed Off to Confirmed and deactivates its Settlement Item, inside the same function body (one transaction), with no exception-swallowing", () => {
  const body = extractBlock(sql, "CREATE OR REPLACE FUNCTION cancel_settlement_with_reversal(", "\n$$;");
  assert.match(body, /FROM settlement_items si\s*\n\s*JOIN compensations c ON c\.id = si\.compensation_id/, "must join settlement_items to compensations for this settlement");
  assert.match(body, /AND si\.is_active/, "the cascade must only consider ACTIVE settlement_items rows");
  assert.match(body, /UPDATE compensations SET status = 'Confirmed'/, "must revert the compensation to Confirmed");
  assert.match(body, /UPDATE settlement_items SET is_active = false WHERE settlement_id = p_settlement_id AND is_active/, "must deactivate the settlement_items rows for this settlement");
  assert.doesNotMatch(body, /EXCEPTION\s+WHEN/i, "must not catch its own exceptions — a partial cascade must never commit");
});

test("HISTORY PRESERVED (static): settlement_items rows are only deactivated, never deleted, by this migration or its function", () => {
  assert.doesNotMatch(sql, /DELETE FROM settlement_items/i, "must never DELETE settlement_items rows — history must remain queryable");
});

test("RLS (static): settlement_items rejects a direct authenticated/anon UPDATE that lands is_active=false", () => {
  for (const role of ["authenticated", "anon"]) {
    const marker = `Allow ${role} update except direct deactivation" ON settlement_items`;
    const policyIndex = sql.indexOf(marker);
    assert.notEqual(policyIndex, -1, `Expected an UPDATE policy on settlement_items for ${role} guarding deactivation`);
    const statement = sql.slice(sql.lastIndexOf("CREATE POLICY", policyIndex), sql.indexOf(";", policyIndex) + 1);
    assert.match(statement, /FOR UPDATE/, `settlement_items/${role} policy must be FOR UPDATE`);
    assert.match(statement, /WITH CHECK \(is_active\)/, `settlement_items/${role} policy must reject any resulting row with is_active=false`);
  }
});

test("PERMISSIONS (static): no new permission row is inserted — cancellation reuses the existing settlement.manage key", () => {
  assert.doesNotMatch(sql, /INSERT INTO permissions/i, "must not add any new permission row");
  assert.match(sql, /'settlement\.manage'/, "must reference the existing settlement.manage permission key");
});
