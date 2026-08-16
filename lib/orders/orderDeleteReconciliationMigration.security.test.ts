import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Admin Order Delete/Reconciliation — static verification of the security
 * migration, mirroring lib/moneyDebtLedger/moneyDebtLedgerMigration.security.test.ts's
 * own established pattern for this exact problem class.
 *
 * IMPORTANT LIMITATION, stated plainly: this repository has no live
 * Postgres/Supabase connection available inside the automated test runner,
 * so these tests cannot execute real SQL against a database. What follows
 * is the strongest static verification available instead: parsing the
 * actual migration file's SQL text and asserting on the specific
 * REVOKE/GRANT/function-body properties that determine the real privilege
 * state if applied exactly as written — a regression guard against a
 * future edit silently reintroducing the exact gap this migration closes
 * (anon/authenticated retaining EXECUTE, or the Owner/Compensation checks
 * being removed), not a substitute for the live Dev verification performed
 * separately for this release (see the migration's own "Manual" check
 * comments for what a live run confirms).
 */

const MIGRATION_PATH = path.join(
  __dirname,
  "..",
  "..",
  "supabase",
  "migrations",
  "2026081717_admin_order_delete_execute_privilege_fix.sql"
);
const sql = fs.readFileSync(MIGRATION_PATH, "utf8");

function extractBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Could not find start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Could not find end marker after start: ${endMarker}`);
  return source.slice(start, end);
}

test("SECURITY (static): the old 1-argument delete_order_with_reconciliation(uuid) signature is explicitly DROPped", () => {
  assert.match(sql, /DROP FUNCTION IF EXISTS delete_order_with_reconciliation\(uuid\);/, "the insecure original signature must be dropped, not left coexisting alongside the new one");
});

test("SECURITY (static): the new function is SECURITY DEFINER with SET search_path = public", () => {
  const signatureBlock = extractBlock(sql, "CREATE FUNCTION delete_order_with_reconciliation(", "AS $$");
  assert.match(signatureBlock, /SECURITY DEFINER/, "must be SECURITY DEFINER — service_role calls carry no end-user session for SECURITY INVOKER to rely on");
  assert.match(signatureBlock, /SET search_path = public/, "SECURITY DEFINER without a pinned search_path is a privilege-escalation risk");
});

test("SECURITY (static): REVOKEs EXECUTE explicitly from PUBLIC, anon, AND authenticated (not just PUBLIC)", () => {
  const revokeIndex = sql.indexOf("REVOKE ALL ON FUNCTION delete_order_with_reconciliation(uuid, uuid)");
  assert.notEqual(revokeIndex, -1, "must REVOKE ALL on the new 2-argument signature");
  const revokeStatement = sql.slice(revokeIndex, sql.indexOf(";", revokeIndex) + 1);
  assert.match(revokeStatement, /FROM PUBLIC, anon, authenticated/, "must explicitly name PUBLIC, anon, AND authenticated — this project's schema grants EXECUTE to anon/authenticated directly via default privileges, independent of PUBLIC (see Money & Debt Ledger's own 2026081715 fix for the same root cause)");
});

test("SECURITY (static): GRANTs EXECUTE only to service_role, never to anon or authenticated", () => {
  const grantIndex = sql.indexOf("GRANT EXECUTE ON FUNCTION delete_order_with_reconciliation(uuid, uuid)");
  assert.notEqual(grantIndex, -1, "must GRANT EXECUTE on the new 2-argument signature");
  const grantStatement = sql.slice(grantIndex, sql.indexOf(";", grantIndex) + 1);
  assert.doesNotMatch(grantStatement, /\banon\b/, `GRANT EXECUTE must not name 'anon': ${grantStatement}`);
  assert.doesNotMatch(grantStatement, /\bauthenticated\b/, `GRANT EXECUTE must not name 'authenticated': ${grantStatement}`);
  assert.match(grantStatement, /\bservice_role\b/, `GRANT EXECUTE should target service_role: ${grantStatement}`);
});

test("SECURITY (static): the function rejects a null/unresolvable p_staff_id before any data is touched", () => {
  const body = extractBlock(sql, "CREATE FUNCTION delete_order_with_reconciliation(", "\n$$;");
  const nullCheckIndex = body.indexOf("IF p_staff_id IS NULL THEN");
  const roleNullCheckIndex = body.indexOf("IF v_role_key IS NULL THEN");
  const firstDeleteIndex = body.indexOf("DELETE FROM sales_commissions");
  assert.notEqual(nullCheckIndex, -1, "must reject a NULL p_staff_id");
  assert.notEqual(roleNullCheckIndex, -1, "must reject a p_staff_id that doesn't resolve to a real, active-role staff row");
  assert.ok(nullCheckIndex < firstDeleteIndex && roleNullCheckIndex < firstDeleteIndex, "staff-id checks must run before any DELETE statement");
});

test("SECURITY (static): the function independently verifies role_key = 'Owner' before any data is touched", () => {
  const body = extractBlock(sql, "CREATE FUNCTION delete_order_with_reconciliation(", "\n$$;");
  const ownerCheckIndex = body.indexOf("IF v_role_key IS DISTINCT FROM 'Owner' THEN");
  const firstDeleteIndex = body.indexOf("DELETE FROM sales_commissions");
  assert.notEqual(ownerCheckIndex, -1, "must independently verify the resolved role is exactly 'Owner'");
  assert.ok(ownerCheckIndex < firstDeleteIndex, "the Owner check must run before any DELETE statement");
});

test("SECURITY (static): the function independently re-verifies no Confirmed/Handed Off compensation exists, before any data is touched", () => {
  const body = extractBlock(sql, "CREATE FUNCTION delete_order_with_reconciliation(", "\n$$;");
  const compCheckIndex = body.indexOf("status IN ('Confirmed', 'Handed Off')");
  const firstDeleteIndex = body.indexOf("DELETE FROM sales_commissions");
  assert.notEqual(compCheckIndex, -1, "must check for Confirmed/Handed Off compensations");
  assert.ok(compCheckIndex < firstDeleteIndex, "the compensation check must run before any DELETE statement — this is the database-level re-enforcement of the same rule order.service.ts's deleteOrder already applies at the application layer");
});

test("SECURITY (static): no EXCEPTION-catching block — a failure at any step aborts the whole function, no partial delete is possible", () => {
  const body = extractBlock(sql, "CREATE FUNCTION delete_order_with_reconciliation(", "\n$$;");
  assert.doesNotMatch(body, /EXCEPTION\s+WHEN/i, "must not catch its own exceptions — that would let a partially-completed reconciliation commit");
});

test("CORRECTNESS (static): product status is restored to 'Active', never 'Available' — Product Status Standardization is explicitly out of scope for this release", () => {
  const body = extractBlock(sql, "CREATE FUNCTION delete_order_with_reconciliation(", "\n$$;");
  assert.match(body, /SET status = 'Active'/, "must restore products to 'Active', matching the current Production-approved status model");
  // Checks the functional UPDATE statement only, not doc comments — this
  // migration's own header/body comments legitimately mention 'Available'
  // by name to explain why it is NOT used (2026081713 comparison), which
  // would false-positive a blanket substring check across the whole body.
  assert.doesNotMatch(body, /SET status = 'Available'/, "must not set product status to 'Available' anywhere — that literal belongs to the separate, not-yet-approved Product Status Standardization feature");
});

test("SCOPE (static): this migration does not touch settlements, compensation_ledger_entries, or any permissions/role_permissions rows", () => {
  assert.doesNotMatch(sql, /\bsettlements\b/i, "must not reference the settlements table");
  assert.doesNotMatch(sql, /\bcompensation_ledger_entries\b/i, "must not reference compensation_ledger_entries");
  assert.doesNotMatch(sql, /INSERT INTO permissions/i, "must not add/change permission rows — this feature has no permission key of its own, per Product Owner instruction");
  assert.doesNotMatch(sql, /INSERT INTO role_permissions|UPDATE\s+role_permissions|DELETE FROM role_permissions/i, "must not mutate role_permissions — no SQL-based permission grant");
});
