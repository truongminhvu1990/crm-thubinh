-- Compensation Ledger — DB-level immutable-history guard (2026-08-16).
-- Product Owner directive: bring Compensation Ledger's financial-history
-- immutability guarantee to parity with Money & Debt Ledger
-- (2026081716_money_debt_ledger_immutability_guard.sql).
--
-- Root cause: compensation_ledger_entries' only protection until now was
-- RLS (2026081401_compensation_ledger_module.sql: SELECT-only for anon/
-- authenticated). RLS does not bind service_role or the table owner —
-- this is standard, documented Postgres/Supabase behavior, not a defect
-- introduced by that migration. It is the exact same class of gap already
-- found live and fixed for money_debt_ledger_entries; it was never
-- backported here because that finding postdated this table's own
-- migration. This migration closes it the same way: a trigger, which
-- fires on the DML statement itself regardless of role, RLS policy, or
-- BYPASSRLS — the only way to skip it is to disable it explicitly (a
-- schema change, not a privilege) or TRUNCATE (addressed below too).
--
-- Scope: ONE new trigger function, applied via 3 trigger registrations
-- (UPDATE, DELETE, TRUNCATE) on compensation_ledger_entries only. Does
-- NOT touch settlements, the settlements_record_ledger_entry trigger, the
-- record_compensation_ledger_entry() write function, running_balance
-- calculation, activity_logs, permissions, or any other table — the
-- existing INSERT write path (Settlement reaching Completed) is
-- byte-for-byte unchanged. Does not alter any existing row (the guard
-- function never reads/writes row data, it only ever raises).
--
-- No correction mechanism is added or invented here. entry_type already
-- reserves the literal 'Adjustment' for a future correction record
-- (2026081401_compensation_ledger_module.sql, Decision 2: "Adjustments
-- are new Entries, never rewrites") but no code path creates one — that
-- remains true after this migration; this task does not build it,
-- per direct instruction not to invent a new business correction model.

BEGIN;

CREATE OR REPLACE FUNCTION prevent_compensation_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'compensation_ledger_entries is append-only (docs/15_COMPENSATION_LEDGER_SPEC.md §3/§11): % is prohibited on this table — the only write path is record_compensation_ledger_entry() on Settlement completion; a correction, if ever built, must be a new Entry, never an UPDATE, DELETE, or TRUNCATE', TG_OP
    USING ERRCODE = '42501';
END;
$$;

-- Row-level guard — fires once per affected row, for UPDATE and DELETE
-- alike, for any role (including service_role/the table owner), before
-- the operation takes effect. No WHEN clause, no exception path: every
-- UPDATE and every DELETE against this table is rejected, unconditionally.
DROP TRIGGER IF EXISTS compensation_ledger_entries_prevent_mutation ON compensation_ledger_entries;
CREATE TRIGGER compensation_ledger_entries_prevent_mutation
BEFORE UPDATE OR DELETE ON compensation_ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_compensation_ledger_mutation();

-- Statement-level guard — TRUNCATE bypasses row-level triggers entirely by
-- Postgres design (it never fires ROW-level BEFORE UPDATE/DELETE
-- triggers), so it needs its own STATEMENT-level trigger to close that
-- gap. Same function, reused as-is: it never reads NEW/OLD, so it works
-- identically at ROW or STATEMENT level, and TG_OP correctly reports
-- 'TRUNCATE' here.
DROP TRIGGER IF EXISTS compensation_ledger_entries_prevent_truncate ON compensation_ledger_entries;
CREATE TRIGGER compensation_ledger_entries_prevent_truncate
BEFORE TRUNCATE ON compensation_ledger_entries
FOR EACH STATEMENT EXECUTE FUNCTION prevent_compensation_ledger_mutation();

-- settlements_record_ledger_entry (the existing INSERT-only write trigger
-- on `settlements`, 2026081401_compensation_ledger_module.sql) is
-- untouched — it only ever INSERTs into compensation_ledger_entries,
-- never UPDATEs/DELETEs, so it is unaffected by the two guards above.
-- INSERT and SELECT on compensation_ledger_entries itself are likewise
-- untouched — neither guard is registered for either operation.

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'compensation_ledger_entries'::regclass AND NOT tgisinternal;
-- Manual negative check (Dev only, service_role key): attempt
--   UPDATE compensation_ledger_entries SET entry_type = 'Adjustment' WHERE id = '<any existing id>';
-- and
--   DELETE FROM compensation_ledger_entries WHERE id = '<any existing id>';
-- both must fail with the trigger's own RAISE EXCEPTION message, and the
-- targeted row must be unchanged/still present afterward.
-- Manual positive check: complete a Settlement (status -> Completed) and
-- confirm record_compensation_ledger_entry() still successfully inserts
-- exactly one new row (INSERT unaffected).
