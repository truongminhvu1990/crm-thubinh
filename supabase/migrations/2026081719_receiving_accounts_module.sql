-- Receiving Accounts (Payment / Bank Account / Money-Debt domain redesign,
-- Stage 2) — Product Owner Implementation Authorization, 2026-08-16.
--
-- Scope: ONE new table (`receiving_accounts`), ONE new nullable column on
-- `payments` (`receiving_account_id`), required indexes, an `updated_at`
-- trigger reusing the existing shared `set_customers_updated_at()`
-- function, and RLS matching this project's ordinary mutable-reference-
-- data pattern (`partners`/`master_data`/`payments` themselves). Does NOT
-- touch `payment_method` semantics, does NOT modify any existing payment
-- row, does NOT create bank or receiving-account data, does NOT touch
-- Money & Debt Ledger, Compensation Ledger, Settlement, or Compensation in
-- any way.
--
-- ============================================================
-- Why this table, why now (see docs audit trail for full reasoning):
-- ============================================================
-- "Tech_H" today conflates four separate concepts into one payment_method
-- string: how the customer paid, which bank received it, whose account it
-- landed in, and what currency. This migration introduces the missing
-- structural layer — Bank × Owner × Currency × Account — WITHOUT touching
-- payment_method itself and WITHOUT backfilling any historical row.
-- `payment_method` keeps meaning exactly what it always has ("Cash",
-- "Bank Transfer", ...); `receiving_account_id` is a new, independent,
-- always-optional fact about WHERE a bank-transfer-style payment landed.
--
-- Bank reference data: reuses the existing, already-approved
-- master_data(category='bank') category (introduced by the still-separate
-- 2026080401_ux_enhancement_master_data.sql / widened further by
-- 2026081704_inventory_adjustment_reason_and_audit.sql) — no new bank
-- table. `receiving_accounts.bank_id` is a bare FK to `master_data.id`;
-- it does NOT and cannot enforce category='bank' at the DB level (a CHECK
-- constraint cannot reference another table, and a trigger for this would
-- be disproportionate complexity for what is, at the only real write path,
-- already a UI dropdown scoped to category='bank' — the same mechanism
-- payment_method's own dropdown already relies on). Category correctness
-- is an application-layer concern by deliberate design, not an oversight.
--
-- Owner: reuses the existing `partners` table — no new entity. Matches the
-- exact precedent already set when Money & Debt Ledger added "Money
-- Changer"/"Supplier" to partner_type in code only, zero migration,
-- because partners.partner_type has never carried a DB CHECK constraint.
--
-- Uniqueness: deliberately NO UNIQUE constraint on
-- (bank_id, owner_partner_id, currency, account_number). Two independent
-- reasons: (1) the same owner may legitimately hold multiple accounts at
-- the same bank in the same currency; (2) account_number is expected to be
-- a masked/display string (e.g. "****1234"), not a verified unique
-- identifier — two genuinely different real accounts could show the same
-- last-4-digits display value. `id` is the only enforced identity; `label`
-- is a free-text human disambiguator, matching partners.name's and
-- master_data.value's own precedent of free text with no forced
-- uniqueness beyond what a true business identifier (partner_code,
-- (category,value)) already provides.
--
-- FK behavior: ON DELETE RESTRICT throughout (bank_id -> master_data,
-- owner_partner_id -> partners, payments.receiving_account_id ->
-- receiving_accounts) — matches this project's own established pattern
-- for protecting financial-adjacent reference rows
-- (money_debt_ledger_entries.party_id, settlement_items.compensation_id).
-- No DELETE UI/API path is exposed for receiving_accounts at all (see
-- lib/receivingAccount.service.ts) — is_active=false is the only supported
-- way to retire an account, matching master_data.is_active's own
-- convention. RESTRICT is still added at the schema level as defense in
-- depth, not because a DELETE path is expected to exist.
--
-- RLS: mirrors partners/master_data/payments' own existing "Allow full
-- access" pattern (anon + authenticated, FOR ALL) — re-verified against
-- the actual current migration history before writing this file
-- (2026071803_rls_authenticated_role.sql is the migration that added the
-- authenticated policies these tables now have). No new permission key is
-- introduced; INSERT/UPDATE are gated at the application layer by the
-- existing partner.create/partner.update permissions, the same way Money
-- Changer/Supplier required zero new permissions.

BEGIN;

-- ============================================================
-- 1. receiving_accounts
-- ============================================================

CREATE TABLE IF NOT EXISTS receiving_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  bank_id uuid NOT NULL REFERENCES master_data(id) ON DELETE RESTRICT,
  owner_partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE RESTRICT,

  -- Free text, no CHECK — matches partners.partner_type's own precedent;
  -- the set of currencies is expected to grow without a migration.
  currency text NOT NULL,

  -- Expected to be a masked/display value (e.g. "****1234"), not a
  -- verified unique real account number — see uniqueness note above.
  account_number text NOT NULL,

  -- Free-text human disambiguator when bank/owner/currency alone aren't
  -- enough to tell two accounts apart at a glance.
  label text,

  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receiving_accounts_bank_id ON receiving_accounts(bank_id);
CREATE INDEX IF NOT EXISTS idx_receiving_accounts_owner_partner_id ON receiving_accounts(owner_partner_id);

-- updated_at — reuses the existing shared trigger function (already backs
-- customers/settlements/etc.), not a new one.
DROP TRIGGER IF EXISTS receiving_accounts_set_updated_at ON receiving_accounts;
CREATE TRIGGER receiving_accounts_set_updated_at
BEFORE UPDATE ON receiving_accounts
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

-- RLS: ordinary mutable reference data — same "Allow full access" shape as
-- partners/master_data/payments themselves, re-verified against the
-- actual current migration history (2026071803_rls_authenticated_role.sql)
-- before writing this, not assumed from the prior audit alone.
ALTER TABLE receiving_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access to anon" ON receiving_accounts;
CREATE POLICY "Allow full access to anon" ON receiving_accounts FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow full access to authenticated" ON receiving_accounts;
CREATE POLICY "Allow full access to authenticated" ON receiving_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2. payments.receiving_account_id — nullable, additive only.
-- ============================================================
-- Nullable because: Cash (and every non-bank-transfer method) has no
-- receiving account; all 50 existing historical payments have no value
-- for this and MUST stay valid and untouched; this is an additive
-- rollout, not a backfill (no historical data is written by this
-- migration — see the header comment).

ALTER TABLE payments ADD COLUMN IF NOT EXISTS receiving_account_id uuid NULL
  REFERENCES receiving_accounts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_payments_receiving_account_id ON payments(receiving_account_id);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'receiving_accounts';
-- SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'receiving_accounts' ORDER BY ordinal_position;
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'receiving_accounts'::regclass;
-- SELECT indexname FROM pg_indexes WHERE tablename = 'receiving_accounts';
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename = 'receiving_accounts'; -- expect exactly 2 rows, both FOR ALL (anon, authenticated)
-- SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'receiving_account_id'; -- expect YES
-- SELECT count(*) FROM payments WHERE receiving_account_id IS NOT NULL; -- expect 0
-- SELECT count(*) FROM payments; -- expect unchanged from before this migration
