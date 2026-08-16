-- Payment / Bank Account / Money-Debt domain redesign, Stage 5 (Product
-- Owner Locked Decisions, 2026-08-16) — adds exactly ONE new, independent,
-- nullable relationship to receiving_accounts. Does not touch bank_id,
-- owner_partner_id, currency, account_number, payment_method,
-- money_debt_ledger_entries, or either existing Money/Debt Ledger write
-- function.
--
-- money_changer_partner_id means: "Which Money Changer should be
-- associated with this receiving account for Money/Debt
-- reconciliation/pre-fill." It is intentionally independent of
-- owner_partner_id ("who legally owns/holds this bank account") — they may
-- be the same partner or different partners (Locked Decision 5). NULL is a
-- valid, common state meaning "no configured association" (Decision 6).
--
-- ON DELETE SET NULL (Decision 7): this is an informational/pre-fill
-- association, not the financial ledger's own authoritative party
-- relationship (money_debt_ledger_entries.party_id, which keeps its own
-- separate ON DELETE RESTRICT). Deleting the referenced partner clears the
-- association on any receiving_accounts row that pointed at it; existing
-- money_debt_ledger_entries rows are entirely unaffected either way, since
-- they never reference receiving_accounts at all.
--
-- Deliberately NO CHECK constraint tying this column to
-- partners.partner_type = 'Money Changer' — partner_type is intentionally
-- unconstrained project-wide (matches owner_partner_id's own precedent,
-- money_debt_ledger_entries.party_type's own precedent). Validated at the
-- application boundary instead (lib/receivingAccount.service.ts).

BEGIN;

ALTER TABLE receiving_accounts
  ADD COLUMN money_changer_partner_id uuid NULL REFERENCES partners(id) ON DELETE SET NULL;

-- Justified by actual query usage: Phase 4's generic candidate-detection
-- path filters receiving_accounts WHERE money_changer_partner_id IS NOT
-- NULL (money_debt_ledger's getReconciliationCandidates joins against this
-- column), same idiom as the existing idx_money_debt_ledger_linked_payment_id
-- index backing a comparable lookup.
CREATE INDEX IF NOT EXISTS idx_receiving_accounts_money_changer_partner_id
  ON receiving_accounts(money_changer_partner_id);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'receiving_accounts' AND column_name = 'money_changer_partner_id';
-- SELECT conname, confdeltype FROM pg_constraint WHERE conrelid = 'receiving_accounts'::regclass AND conname LIKE '%money_changer%'; -- expect confdeltype = 'n' (SET NULL)
-- SELECT indexname FROM pg_indexes WHERE tablename = 'receiving_accounts' AND indexname = 'idx_receiving_accounts_money_changer_partner_id';
