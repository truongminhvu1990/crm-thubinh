import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Compensation Ledger — immutability guard (2026-08-16), static
 * verification of 2026081717_compensation_ledger_immutability_guard.sql.
 *
 * Same limitation as the Money & Debt Ledger equivalent
 * (lib/moneyDebtLedger/moneyDebtLedgerMigration.security.test.ts): no live
 * Postgres/Supabase connection is available inside the automated test
 * runner, so these tests cannot execute real SQL. This is the strongest
 * static verification available instead — a regression guard against a
 * future edit silently reintroducing the RLS-only gap this migration
 * closes, not a substitute for the live Dev verification performed
 * separately (see that migration's own "Manual negative check" comment).
 */

const MIGRATION_PATH = path.join(__dirname, "..", "..", "supabase", "migrations", "2026081717_compensation_ledger_immutability_guard.sql");
const ORIGINAL_MODULE_PATH = path.join(__dirname, "..", "..", "supabase", "migrations", "2026081401_compensation_ledger_module.sql");
const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
const sqlOriginal = fs.readFileSync(ORIGINAL_MODULE_PATH, "utf8");

function extractBlock(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Could not find start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Could not find end marker after start: ${endMarker}`);
  return source.slice(start, end);
}

test("IMMUTABILITY GUARD (static): registers a BEFORE UPDATE OR DELETE row-level trigger and a BEFORE TRUNCATE statement-level trigger on compensation_ledger_entries, both using the same unconditional-RAISE function", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION prevent_compensation_ledger_mutation\(\)/, "Expected the guard function to be defined");

  const rowTriggerIndex = sql.indexOf("CREATE TRIGGER compensation_ledger_entries_prevent_mutation");
  assert.notEqual(rowTriggerIndex, -1, "Expected the row-level UPDATE/DELETE trigger");
  const rowTriggerBlock = sql.slice(rowTriggerIndex, sql.indexOf(";", rowTriggerIndex) + 1);
  assert.match(rowTriggerBlock, /BEFORE UPDATE OR DELETE ON compensation_ledger_entries/, "Row-level trigger must fire BEFORE UPDATE OR DELETE, on the correct table");
  assert.match(rowTriggerBlock, /FOR EACH ROW/, "Row-level trigger must be FOR EACH ROW");
  assert.match(rowTriggerBlock, /EXECUTE FUNCTION prevent_compensation_ledger_mutation\(\)/, "Row-level trigger must call the guard function");

  const truncateTriggerIndex = sql.indexOf("CREATE TRIGGER compensation_ledger_entries_prevent_truncate");
  assert.notEqual(truncateTriggerIndex, -1, "Expected the statement-level TRUNCATE trigger — row-level triggers never fire on TRUNCATE in Postgres");
  const truncateTriggerBlock = sql.slice(truncateTriggerIndex, sql.indexOf(";", truncateTriggerIndex) + 1);
  assert.match(truncateTriggerBlock, /BEFORE TRUNCATE ON compensation_ledger_entries/, "TRUNCATE trigger must fire BEFORE TRUNCATE, on the correct table");
  assert.match(truncateTriggerBlock, /FOR EACH STATEMENT/, "TRUNCATE trigger must be FOR EACH STATEMENT (row-level is invalid for TRUNCATE)");
  assert.match(truncateTriggerBlock, /EXECUTE FUNCTION prevent_compensation_ledger_mutation\(\)/, "TRUNCATE trigger must call the same guard function");
});

test("IMMUTABILITY GUARD (static): the guard function unconditionally RAISE EXCEPTIONs — no WHEN clause, no conditional logic, no admin/service-role/force-delete exception of any kind", () => {
  const body = extractBlock(sql, "CREATE OR REPLACE FUNCTION prevent_compensation_ledger_mutation()", "\n$$;");
  assert.match(body, /RAISE EXCEPTION/, "Expected an unconditional RAISE EXCEPTION");
  // Match the actual plpgsql conditional construct (IF ... THEN), not the
  // bare substring "if" — which also appears inside this function's own
  // RAISE EXCEPTION message text ("...if ever built...") and would
  // otherwise be a false positive.
  assert.doesNotMatch(body, /\bIF\b[^']*\bTHEN\b/i, "The guard function must not contain any conditional logic (IF...THEN) — no bypass path exists at all, for any role");
  assert.doesNotMatch(sql, /force_delete|admin_bypass|service_role_exception|WHEN\s*\(/i, "No administrative bypass / force-delete / service-role exception may exist anywhere in this migration");
});

test("IMMUTABILITY GUARD (static): does not touch INSERT/SELECT, settlements, the existing write trigger/function, or any other table's rows", () => {
  const executableBlock = extractBlock(sql, "BEGIN;", "\nCOMMIT;");

  assert.doesNotMatch(executableBlock, /BEFORE INSERT|AFTER INSERT/i, "Must not add any INSERT trigger — INSERT must remain unaffected");
  assert.doesNotMatch(executableBlock, /ALTER TABLE compensation_ledger_entries\s+ADD|ALTER TABLE compensation_ledger_entries\s+DROP|ALTER TABLE compensation_ledger_entries\s+ALTER/i, "Must not alter the table's own columns/constraints");
  assert.doesNotMatch(executableBlock, /CREATE TABLE|ALTER TABLE (?!compensation_ledger_entries)/i, "Must not create or alter any other table");
  assert.doesNotMatch(executableBlock, /^\s*UPDATE compensation_ledger_entries\s+SET|^\s*DELETE FROM compensation_ledger_entries/im, "The migration itself must not perform any UPDATE/DELETE — it only installs the guard, never alters existing rows");
  assert.doesNotMatch(executableBlock, /DROP TRIGGER IF EXISTS settlements_record_ledger_entry|CREATE TRIGGER settlements_record_ledger_entry/i, "Must not touch the existing settlements_record_ledger_entry write trigger");
  // Scoped to actual statements that would modify the function (CREATE OR
  // REPLACE / DROP FUNCTION), not any textual mention — this migration's
  // own explanatory comments legitimately name the function to say it's
  // untouched, which must not itself trip this check.
  assert.doesNotMatch(executableBlock, /CREATE (OR REPLACE )?FUNCTION record_compensation_ledger_entry|DROP FUNCTION.*record_compensation_ledger_entry/i, "Must not modify the existing write function");
  assert.doesNotMatch(executableBlock, /ALTER TABLE settlements\b/i, "Must not touch settlements at all");
  assert.doesNotMatch(executableBlock, /INSERT INTO permissions|role_permissions/i, "Must not touch permissions — this is a schema-only hardening change");
});

test("INSERT SAFETY (static): the pre-existing write path (settlements -> record_compensation_ledger_entry -> INSERT) is untouched by this migration and remains the only INSERT source", () => {
  // Confirm the original write function/trigger still only exists once,
  // defined in the original module migration, and this new migration
  // never redefines or drops it.
  assert.match(sqlOriginal, /CREATE OR REPLACE FUNCTION record_compensation_ledger_entry\(\)/, "Sanity check: the original write function is defined where expected");
  assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION record_compensation_ledger_entry/i, "This migration must not redefine the existing write function");
  assert.doesNotMatch(sql, /DROP FUNCTION.*record_compensation_ledger_entry/i, "This migration must not drop the existing write function");
});
