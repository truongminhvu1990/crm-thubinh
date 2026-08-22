import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Settlement Paid (Finance Project #1, Phase A) — static verification of
 * 2026082101_settlement_paid_module.sql.
 *
 * Same limitation as moneyDebtLedgerMigration.security.test.ts: no live
 * Postgres/Supabase connection is available inside the automated test
 * runner, so this cannot execute real SQL. What follows parses the actual
 * migration file's SQL text and asserts on the specific REVOKE/GRANT/
 * CHECK/RLS/function-body properties that determine the real privilege and
 * state-machine guarantees if applied exactly as written — a regression
 * guard against a future edit silently reopening the "direct client UPDATE
 * can set status='Paid'" gap this migration closes, not a substitute for
 * the migration's own "Manual ... check" comments run live on Dev.
 */

const MIGRATION_PATH = path.join(__dirname, "..", "..", "supabase", "migrations", "2026082101_settlement_paid_module.sql");
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

test("SECURITY (static): mark_settlement_paid and settlement_staff_has_permission are revoked from PUBLIC/anon/authenticated and granted only to service_role", () => {
  for (const fn of ["settlement_staff_has_permission", "mark_settlement_paid"]) {
    const revokeIndex = sql.indexOf(`REVOKE ALL ON FUNCTION ${fn}(`);
    assert.notEqual(revokeIndex, -1, `Expected a REVOKE ALL for ${fn}`);
    const revokeStatement = sql.slice(revokeIndex, sql.indexOf(";", revokeIndex) + 1);
    assert.match(revokeStatement, /FROM PUBLIC, anon, authenticated/, `${fn}'s REVOKE must explicitly name PUBLIC, anon, AND authenticated`);

    const grantIndex = sql.indexOf(`GRANT EXECUTE ON FUNCTION ${fn}(`);
    assert.notEqual(grantIndex, -1, `Expected a GRANT EXECUTE for ${fn}`);
    const grantStatement = sql.slice(grantIndex, sql.indexOf(";", grantIndex) + 1);
    assert.doesNotMatch(grantStatement, /\banon\b/, `${fn}'s GRANT must not name anon`);
    assert.doesNotMatch(grantStatement, /\bauthenticated\b/, `${fn}'s GRANT must not name authenticated`);
    assert.match(grantStatement, /\bservice_role\b/, `${fn}'s GRANT must target service_role`);
  }
});

test("SECURITY (static): mark_settlement_paid requires a non-null, staff-verified p_staff_id and checks settlement_staff_has_permission before any UPDATE", () => {
  const body = extractBlock(sql, "CREATE OR REPLACE FUNCTION mark_settlement_paid(", "\n$$;");
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

test("STATE MACHINE (static): mark_settlement_paid only accepts a Completed settlement (rejects any other status before writing)", () => {
  const body = extractBlock(sql, "CREATE OR REPLACE FUNCTION mark_settlement_paid(", "\n$$;");
  const statusCheckIndex = body.indexOf("IF v_status <> 'Completed' THEN");
  const firstUpdateIndex = body.indexOf("UPDATE settlements");
  assert.notEqual(statusCheckIndex, -1, "must reject any status other than Completed");
  assert.ok(statusCheckIndex < firstUpdateIndex, "the Completed-only check must run before the UPDATE");
});

test("CASCADE (static): mark_settlement_paid updates every member compensation still Handed Off to Paid, inside the same function body (one transaction)", () => {
  const body = extractBlock(sql, "CREATE OR REPLACE FUNCTION mark_settlement_paid(", "\n$$;");
  assert.match(body, /FROM settlement_items si\s*\n\s*JOIN compensations c ON c\.id = si\.compensation_id/, "must join settlement_items to compensations for this settlement");
  assert.match(body, /AND c\.status = 'Handed Off'/, "must scope the cascade to compensations still Handed Off");
  assert.match(body, /UPDATE compensations SET status = 'Paid', paid_at = now\(\)/, "must set compensations to Paid with paid_at");
  assert.doesNotMatch(body, /EXCEPTION\s+WHEN/i, "must not catch its own exceptions — a partial cascade must never commit");
});

test("RLS (static): both settlements and compensations reject a direct authenticated/anon UPDATE that lands status='Paid'", () => {
  for (const table of ["settlements", "compensations"]) {
    for (const role of ["authenticated", "anon"]) {
      const marker = `Allow ${role} update except direct Paid transition" ON ${table}`;
      const policyIndex = sql.indexOf(marker);
      assert.notEqual(policyIndex, -1, `Expected an UPDATE policy on ${table} for ${role} guarding the Paid transition`);
      const statement = sql.slice(sql.lastIndexOf("CREATE POLICY", policyIndex), sql.indexOf(";", policyIndex) + 1);
      assert.match(statement, /FOR UPDATE/, `${table}/${role} policy must be FOR UPDATE`);
      assert.match(statement, /WITH CHECK \(status <> 'Paid'\)/, `${table}/${role} policy must reject any resulting row with status='Paid'`);
    }
  }
});

test("INTEGRITY (static): CHECK constraints on both status columns include 'Paid' alongside every pre-existing value", () => {
  const settlementsCheck = sql.slice(sql.indexOf("ADD CONSTRAINT settlements_status_check"), sql.indexOf(";", sql.indexOf("ADD CONSTRAINT settlements_status_check")) + 1);
  assert.match(settlementsCheck, /'Draft'[\s\S]*'Pending'[\s\S]*'Approved'[\s\S]*'Completed'[\s\S]*'Paid'[\s\S]*'Cancelled'/, "settlements_status_check must include all six values, Paid included");

  const compensationsCheck = sql.slice(sql.indexOf("ADD CONSTRAINT compensations_status_check"), sql.indexOf(";", sql.indexOf("ADD CONSTRAINT compensations_status_check")) + 1);
  assert.match(compensationsCheck, /'Draft'[\s\S]*'Pending'[\s\S]*'Confirmed'[\s\S]*'Cancelled'[\s\S]*'Handed Off'[\s\S]*'Paid'/, "compensations_status_check must include all six values, Paid included");
});

test("PERMISSIONS (static): no new permission row is inserted — Mark as Paid reuses the existing settlement.manage key", () => {
  assert.doesNotMatch(sql, /INSERT INTO permissions/i, "must not add any new permission row");
  assert.match(sql, /'settlement\.manage'/, "must reference the existing settlement.manage permission key");
});
