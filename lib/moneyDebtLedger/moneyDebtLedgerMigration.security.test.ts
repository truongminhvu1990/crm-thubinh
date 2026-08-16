import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Money & Debt Ledger — static verification across all three migrations:
 *   2026081714_money_debt_ledger_module.sql                 (table, RLS, original functions)
 *   2026081715_money_debt_ledger_execute_privilege_fix.sql  (2026-08-16 EXECUTE-privilege fix)
 *   2026081716_money_debt_ledger_immutability_guard.sql     (2026-08-16 UPDATE/DELETE/TRUNCATE trigger guard)
 *
 * IMPORTANT LIMITATION, stated plainly: this repository has no live
 * Postgres/Supabase connection available inside the automated test runner,
 * so these tests cannot execute real SQL against a database. What follows
 * is the strongest static verification available instead: parsing the
 * actual migration files' SQL text and asserting on the specific
 * REVOKE/GRANT/function-body properties that determine the real privilege
 * state if applied exactly as written — this is a regression guard against
 * a future edit silently reintroducing the exact gap the 2026-08-16 fix
 * closed (anon/authenticated retaining EXECUTE via this project's
 * schema-level default privileges), not a substitute for the live Dev
 * verification already performed separately (see that migration's own
 * "Manual negative check" comment for what a live run should confirm).
 *
 * 2026081714's own GRANT/REVOKE statements for
 * create_money_debt_ledger_entry/create_buy_cny_ledger_transaction/
 * money_debt_ledger_staff_has_permission are now historical — those exact
 * function signatures were DROPped by 2026081715 and replaced with a
 * p_staff_id-carrying signature, so the CURRENT privilege state is
 * whatever 2026081715 establishes, not 2026081714. Table/RLS assertions
 * still read 2026081714, which is unchanged there.
 */

const MIGRATION_2714_PATH = path.join(__dirname, "..", "..", "supabase", "migrations", "2026081714_money_debt_ledger_module.sql");
const MIGRATION_2715_PATH = path.join(__dirname, "..", "..", "supabase", "migrations", "2026081715_money_debt_ledger_execute_privilege_fix.sql");
const MIGRATION_2716_PATH = path.join(__dirname, "..", "..", "supabase", "migrations", "2026081716_money_debt_ledger_immutability_guard.sql");
// Normalize CRLF -> LF: this repo has no .gitattributes, so a fresh
// checkout on a core.autocrlf=true Windows machine materializes these .sql
// files with CRLF line endings, while the multi-line marker strings below
// are LF-based JS string literals. Without normalizing, extractBlock's
// indexOf-based matching fails purely on checkout environment, never on
// actual SQL content — normalizing here keeps the assertions meaningful
// across any clean Windows/Linux checkout without touching SQL semantics.
const readMigration = (p: string): string => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const sql2716 = readMigration(MIGRATION_2716_PATH);
const sql2714 = readMigration(MIGRATION_2714_PATH);
const sql2715 = readMigration(MIGRATION_2715_PATH);

function extractBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Could not find start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Could not find end marker after start: ${endMarker}`);
  return source.slice(start, end);
}

test("SECURITY (privilege fix, static): 2026081715 explicitly REVOKEs EXECUTE from PUBLIC, anon, AND authenticated (not just PUBLIC) for all 4 functions", () => {
  const finalFunctions = [
    "money_debt_ledger_current_staff_id",
    "money_debt_ledger_staff_has_permission",
    "create_money_debt_ledger_entry",
    "create_buy_cny_ledger_transaction",
  ];
  for (const fn of finalFunctions) {
    const revokeIndex = sql2715.indexOf(`REVOKE ALL ON FUNCTION ${fn}(`);
    assert.notEqual(revokeIndex, -1, `2026081715 must REVOKE ALL on ${fn}`);
    const revokeStatement = sql2715.slice(revokeIndex, sql2715.indexOf(";", revokeIndex) + 1);
    assert.match(revokeStatement, /FROM PUBLIC, anon, authenticated/, `${fn}'s REVOKE must explicitly name PUBLIC, anon, AND authenticated (this is exactly the bug being fixed — revoking from PUBLIC alone left anon/authenticated with EXECUTE via this project's own default privileges)`);
  }
});

test("SECURITY (privilege fix, static): 2026081715 never grants EXECUTE to anon or authenticated anywhere, only to service_role", () => {
  // GRANT statements here span multiple lines (function arg lists), so
  // extract each full statement up to its terminating ';' rather than
  // checking one line at a time.
  const grantStatements: string[] = [];
  const grantRegex = /GRANT EXECUTE ON FUNCTION/g;
  let match: RegExpExecArray | null;
  while ((match = grantRegex.exec(sql2715)) !== null) {
    const end = sql2715.indexOf(";", match.index);
    grantStatements.push(sql2715.slice(match.index, end + 1));
  }
  assert.ok(grantStatements.length >= 4, "Expected at least 4 GRANT EXECUTE statements (one per function)");
  for (const statement of grantStatements) {
    assert.doesNotMatch(statement, /\banon\b/, `GRANT EXECUTE statement must not name 'anon': ${statement}`);
    assert.doesNotMatch(statement, /\bauthenticated\b/, `GRANT EXECUTE statement must not name 'authenticated': ${statement}`);
    assert.match(statement, /\bservice_role\b/, `GRANT EXECUTE statement should target service_role: ${statement}`);
  }
});

test("SECURITY (privilege fix, static): both write functions require a non-null, staff-verified p_staff_id and check money_debt_ledger_staff_has_permission(p_staff_id, ...) before any INSERT", () => {
  for (const fn of ["create_money_debt_ledger_entry", "create_buy_cny_ledger_transaction"]) {
    const body = extractBlock(sql2715, `CREATE FUNCTION ${fn}(`, "\n$$;");
    const nullCheckIndex = body.indexOf("IF p_staff_id IS NULL THEN");
    const existsCheckIndex = body.indexOf("IF NOT EXISTS (SELECT 1 FROM staff WHERE id = p_staff_id)");
    const permCheckIndex = body.indexOf("money_debt_ledger_staff_has_permission(p_staff_id, 'money_debt_ledger.create')");
    const firstInsertIndex = body.indexOf("INSERT INTO money_debt_ledger_entries");

    assert.notEqual(nullCheckIndex, -1, `${fn} must reject a NULL p_staff_id`);
    assert.notEqual(existsCheckIndex, -1, `${fn} must verify p_staff_id corresponds to a real staff row`);
    assert.notEqual(permCheckIndex, -1, `${fn} must check money_debt_ledger_staff_has_permission(p_staff_id, 'money_debt_ledger.create')`);
    assert.notEqual(firstInsertIndex, -1, `${fn} must contain at least one INSERT INTO money_debt_ledger_entries`);
    assert.ok(nullCheckIndex < firstInsertIndex && existsCheckIndex < firstInsertIndex && permCheckIndex < firstInsertIndex, `${fn}'s authorization checks must all run BEFORE any INSERT`);

    // created_by is written from p_staff_id (the trusted-server-asserted
    // value), never from a session-derived lookup — service_role calls
    // carry no end-user session to derive one from.
    assert.match(body, /p_staff_id\s*$/m, `${fn} should use p_staff_id as the created_by value in its INSERT`);
  }
});

test("SECURITY (privilege fix, static): neither write function accepts p_created_by, and the DB no longer relies on auth.uid()-based session resolution inside them", () => {
  for (const fn of ["create_money_debt_ledger_entry", "create_buy_cny_ledger_transaction"]) {
    const signatureBlock = extractBlock(sql2715, `CREATE FUNCTION ${fn}(`, "\nRETURNS");
    assert.doesNotMatch(signatureBlock, /p_created_by/, `${fn} must not accept a caller-supplied p_created_by`);
    assert.match(signatureBlock, /p_staff_id uuid/, `${fn} must accept p_staff_id`);

    const body = extractBlock(sql2715, `CREATE FUNCTION ${fn}(`, "\n$$;");
    assert.doesNotMatch(body, /money_debt_ledger_current_staff_id\(\)/, `${fn} must no longer call money_debt_ledger_current_staff_id() internally — service_role calls carry no session for auth.uid() to resolve`);
  }
});

test("SECURITY (F/G/H, static, unchanged): money_debt_ledger_entries still has exactly 2 SELECT-only RLS policies, no INSERT/UPDATE/DELETE/ALL policy, per 2026081714", () => {
  const policyBlock = extractBlock(
    sql2714,
    "ALTER TABLE money_debt_ledger_entries ENABLE ROW LEVEL SECURITY;",
    "-- ============================================================\n-- 2. Authorization helpers"
  );
  const createPolicyStatements = policyBlock.match(/CREATE POLICY[^;]+;/g) ?? [];
  assert.equal(createPolicyStatements.length, 2, "Expected exactly 2 CREATE POLICY statements for money_debt_ledger_entries");
  for (const statement of createPolicyStatements) {
    assert.match(statement, /FOR SELECT/, `Every policy on money_debt_ledger_entries must be FOR SELECT: ${statement}`);
    assert.doesNotMatch(statement, /FOR (INSERT|UPDATE|DELETE|ALL)/, `No policy may grant INSERT/UPDATE/DELETE/ALL: ${statement}`);
  }
  assert.doesNotMatch(sql2715, /ALTER TABLE money_debt_ledger_entries/i, "2026081715 must not touch the table's own RLS/DDL at all");
});

test("BUY_CNY atomicity (static, re-verified against the revised function): create_buy_cny_ledger_transaction in 2026081715 still contains no EXCEPTION-catching block and still writes both legs", () => {
  const body = extractBlock(sql2715, "CREATE FUNCTION create_buy_cny_ledger_transaction(", "\n$$;");
  assert.doesNotMatch(body, /EXCEPTION\s+WHEN/i, "create_buy_cny_ledger_transaction must not catch its own exceptions (EXCEPTION WHEN ...) — that would let a partial failure commit");

  const vndInsertIndex = body.indexOf("'VND', p_vnd_amount, 'OUT'");
  const cnyInsertIndex = body.indexOf("'CNY', p_cny_amount, 'IN'");
  assert.notEqual(vndInsertIndex, -1, "Expected the VND OUT leg");
  assert.notEqual(cnyInsertIndex, -1, "Expected the CNY IN leg");
  assert.ok(vndInsertIndex < cnyInsertIndex, "Both legs must be present, in the same function body");
});

test("SECURITY (privilege fix, static): 2026081715 does not INSERT/UPDATE/DELETE permissions or role_permissions rows (read-only JOIN against role_permissions inside the permission check is expected and fine), and never touches partner_type", () => {
  assert.doesNotMatch(sql2715, /INSERT INTO permissions/i, "2026081715 must not add/change permission rows");
  assert.doesNotMatch(sql2715, /INSERT INTO role_permissions|UPDATE\s+role_permissions|DELETE FROM role_permissions/i, "2026081715 must not mutate role_permissions — no SQL-based permission grant (Permission Matrix UI only)");
  assert.doesNotMatch(sql2715, /partner_type/i, "2026081715 must not touch partner_type");
  assert.doesNotMatch(sql2715, /ALTER TABLE partners/i, "2026081715 must not touch the partners table");
});

test("IMMUTABILITY GUARD (static): 2026081716 registers a BEFORE UPDATE OR DELETE row-level trigger and a BEFORE TRUNCATE statement-level trigger on money_debt_ledger_entries, both using the same unconditional-RAISE function", () => {
  assert.match(sql2716, /CREATE OR REPLACE FUNCTION prevent_money_debt_ledger_mutation\(\)/, "Expected the guard function to be defined");

  const rowTriggerIndex = sql2716.indexOf("CREATE TRIGGER money_debt_ledger_entries_prevent_mutation");
  assert.notEqual(rowTriggerIndex, -1, "Expected the row-level UPDATE/DELETE trigger");
  const rowTriggerBlock = sql2716.slice(rowTriggerIndex, sql2716.indexOf(";", rowTriggerIndex) + 1);
  assert.match(rowTriggerBlock, /BEFORE UPDATE OR DELETE ON money_debt_ledger_entries/, "Row-level trigger must fire BEFORE UPDATE OR DELETE");
  assert.match(rowTriggerBlock, /FOR EACH ROW/, "Row-level trigger must be FOR EACH ROW");
  assert.match(rowTriggerBlock, /EXECUTE FUNCTION prevent_money_debt_ledger_mutation\(\)/, "Row-level trigger must call the guard function");

  const truncateTriggerIndex = sql2716.indexOf("CREATE TRIGGER money_debt_ledger_entries_prevent_truncate");
  assert.notEqual(truncateTriggerIndex, -1, "Expected the statement-level TRUNCATE trigger — row-level triggers never fire on TRUNCATE in Postgres, so it needs its own guard");
  const truncateTriggerBlock = sql2716.slice(truncateTriggerIndex, sql2716.indexOf(";", truncateTriggerIndex) + 1);
  assert.match(truncateTriggerBlock, /BEFORE TRUNCATE ON money_debt_ledger_entries/, "TRUNCATE trigger must fire BEFORE TRUNCATE");
  assert.match(truncateTriggerBlock, /FOR EACH STATEMENT/, "TRUNCATE trigger must be FOR EACH STATEMENT (row-level is invalid for TRUNCATE)");
  assert.match(truncateTriggerBlock, /EXECUTE FUNCTION prevent_money_debt_ledger_mutation\(\)/, "TRUNCATE trigger must call the same guard function");
});

test("IMMUTABILITY GUARD (static): the guard function unconditionally RAISE EXCEPTIONs — no WHEN clause, no conditional bypass, no admin/service-role/force-delete exception of any kind", () => {
  const body = extractBlock(sql2716, "CREATE OR REPLACE FUNCTION prevent_money_debt_ledger_mutation()", "\n$$;");
  assert.match(body, /RAISE EXCEPTION/, "Expected an unconditional RAISE EXCEPTION");
  assert.doesNotMatch(body, /\bIF\b/i, "The guard function must not contain any conditional logic — no IF means no bypass path exists at all, for any role");
  assert.doesNotMatch(sql2716, /force_delete|admin_bypass|service_role_exception|WHEN\s*\(/i, "No administrative bypass / force-delete / service-role exception may exist anywhere in this migration");
});

test("IMMUTABILITY GUARD (static): 2026081716 does not touch INSERT/SELECT, the table's columns/constraints, or any other table", () => {
  // Scoped to the actual executable statements (BEGIN;...COMMIT;) — the
  // trailing "Manual negative check" comment block deliberately shows
  // example UPDATE/DELETE SQL for a human to try by hand, which must not
  // be mistaken for an executable statement in the migration itself.
  const executableBlock = extractBlock(sql2716, "BEGIN;", "\nCOMMIT;");

  assert.doesNotMatch(executableBlock, /BEFORE INSERT|AFTER INSERT/i, "Must not add any INSERT trigger — INSERT must remain unaffected");
  assert.doesNotMatch(executableBlock, /ALTER TABLE money_debt_ledger_entries\s+ADD|ALTER TABLE money_debt_ledger_entries\s+DROP|ALTER TABLE money_debt_ledger_entries\s+ALTER/i, "Must not alter the table's own columns/constraints");
  assert.doesNotMatch(executableBlock, /CREATE TABLE|ALTER TABLE (?!money_debt_ledger_entries)/i, "Must not create or alter any other table");
  assert.doesNotMatch(executableBlock, /^\s*UPDATE money_debt_ledger_entries\s+SET|^\s*DELETE FROM money_debt_ledger_entries/im, "The migration itself must not perform any UPDATE/DELETE — it only installs the guard, never alters existing rows");
});
