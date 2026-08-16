-- Money & Debt Ledger — DB-level immutable-history guard (2026-08-16).
-- Follow-up to 2026081714/2026081715. Prompted by a live Dev finding: a
-- direct service_role UPDATE against money_debt_ledger_entries succeeded,
-- because Row Level Security (the only immutability mechanism in place
-- until now) does not apply to service_role/the table owner by design —
-- RLS and BYPASSRLS are Postgres/Supabase's own documented behavior, not a
-- bug in the prior migrations. D7 (docs/19_MONEY_DEBT_LEDGER_SPEC.md) is
-- explicit: "Once created: UPDATE prohibited, DELETE prohibited.
-- Corrections use ADJUSTMENT." RLS alone cannot deliver that guarantee for
-- every possible caller; a trigger can, because triggers fire on the DML
-- statement itself regardless of which role issues it, RLS policies, or
-- BYPASSRLS — the only ways to skip a trigger are to disable it
-- explicitly (a schema change, not a privilege) or to TRUNCATE (which
-- skips row-level triggers specifically, addressed below too).
--
-- Scope: ONE new trigger function, applied via 3 trigger registrations
-- (UPDATE, DELETE, TRUNCATE) on money_debt_ledger_entries only. Does not
-- touch any other table, does not add any bypass, override, or
-- "administrative delete" path of any kind — per instruction, none was
-- added. Does not alter any existing row (the function never reads/writes
-- row data, it only ever raises).
--
-- Repository convention followed: DROP TRIGGER IF EXISTS + CREATE TRIGGER
-- (same idempotent-reapply shape already used for
-- partners_set_updated_at / settlements_record_ledger_entry), and
-- CREATE OR REPLACE FUNCTION — safe to re-run this file from the top.

BEGIN;

CREATE OR REPLACE FUNCTION prevent_money_debt_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'money_debt_ledger_entries is append-only (docs/19_MONEY_DEBT_LEDGER_SPEC.md D7): % is prohibited on this table — corrections must be a new Adjustment row created via create_money_debt_ledger_entry(), never an UPDATE, DELETE, or TRUNCATE', TG_OP
    USING ERRCODE = '42501';
END;
$$;

-- Row-level guard — fires once per affected row, for UPDATE and DELETE
-- alike, for any role (including service_role/the table owner), before
-- the operation takes effect. No WHEN clause, no exception path: every
-- UPDATE and every DELETE against this table is rejected, unconditionally.
DROP TRIGGER IF EXISTS money_debt_ledger_entries_prevent_mutation ON money_debt_ledger_entries;
CREATE TRIGGER money_debt_ledger_entries_prevent_mutation
BEFORE UPDATE OR DELETE ON money_debt_ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_money_debt_ledger_mutation();

-- Statement-level guard — TRUNCATE bypasses row-level triggers entirely by
-- Postgres design (it never fires ROW-level BEFORE UPDATE/DELETE
-- triggers), so it needs its own STATEMENT-level trigger to close that
-- gap. Same function, reused as-is: it never reads NEW/OLD, so it works
-- identically at ROW or STATEMENT level, and TG_OP correctly reports
-- 'TRUNCATE' here.
DROP TRIGGER IF EXISTS money_debt_ledger_entries_prevent_truncate ON money_debt_ledger_entries;
CREATE TRIGGER money_debt_ledger_entries_prevent_truncate
BEFORE TRUNCATE ON money_debt_ledger_entries
FOR EACH STATEMENT EXECUTE FUNCTION prevent_money_debt_ledger_mutation();

-- INSERT and SELECT are untouched — neither trigger is registered for
-- either operation, and the two SECURITY DEFINER write functions
-- (create_money_debt_ledger_entry / create_buy_cny_ledger_transaction)
-- only ever INSERT, so the existing authorized write path is unaffected.

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT tgname, tgtype, tgenabled FROM pg_trigger WHERE tgrelid = 'money_debt_ledger_entries'::regclass AND NOT tgisinternal;
-- Manual negative check (Dev only, service_role key): attempt
--   UPDATE money_debt_ledger_entries SET note = 'x' WHERE id = '<any existing id>';
-- and
--   DELETE FROM money_debt_ledger_entries WHERE id = '<any existing id>';
-- both must fail with the trigger's own RAISE EXCEPTION message, and the
-- targeted row must be unchanged/still present afterward.
-- Manual positive check: confirm create_money_debt_ledger_entry() and
-- create_buy_cny_ledger_transaction() still succeed (INSERT unaffected).
