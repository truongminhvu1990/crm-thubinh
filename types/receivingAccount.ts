/** Receiving Account (Payment / Bank Account / Money-Debt domain redesign,
 * Stage 2) — describes WHERE a bank-transfer-style payment was received:
 * bank × owner (Partner) × currency × account. Independent of
 * `payment_method` (HOW the customer paid) and of the Money & Debt Ledger's
 * own counterparty concept (WHO the ledger relationship belongs to) — see
 * docs audit trail. Not a payment method, not a ledger party by itself. */

export interface ReceivingAccount {
  id: string;
  /** References master_data.id where category='bank' — validated at the
   * application layer (lib/receivingAccount.service.ts), not by a DB
   * CHECK/trigger (deliberate design decision, see the migration's own
   * header comment). */
  bank_id: string;
  /** References partners.id — the real-world person/entity this account
   * belongs to (e.g. "Vũ", "Bình", "H"). Not necessarily the Money & Debt
   * Ledger counterparty for any given reconciliation; that remains an
   * explicit, separate decision (Stage 4, not this table). */
  owner_partner_id: string;
  /** Free text, no enum — e.g. "VND", "CNY", "USD". */
  currency: string;
  /** Expected to be a masked/display value (e.g. "****1234"), not a
   * verified-unique real account number. */
  account_number: string;
  label?: string | null;
  is_active: boolean;
  /** Stage 5 (Product Owner Locked Decisions, 2026-08-16) — "Which Money
   * Changer should be associated with this receiving account for
   * Money/Debt reconciliation/pre-fill." Intentionally independent of
   * owner_partner_id (Decision 5: may be the same partner, may differ);
   * NULL is a valid, common state meaning "no configured association"
   * (Decision 6). Never inferred from owner_partner_id — only ever set by
   * an explicit choice in the management UI. Must reference a partner
   * whose partner_type is exactly "Money Changer" (Decision 8 — Supplier
   * association is out of scope for this stage), enforced at the
   * application layer (lib/receivingAccount.service.ts), not by a DB
   * CHECK (partner_type stays project-wide unconstrained). */
  money_changer_partner_id: string | null;
  /** Populated by a join when fetched with money_changer — never write
   * this back (same convention as ReceivingAccountOption's bank/owner
   * joins). */
  money_changer?: { id: string; name: string } | null;
  created_at?: string;
  updated_at?: string;
}

export type CreateReceivingAccountInput = Pick<
  ReceivingAccount,
  "bank_id" | "owner_partner_id" | "currency" | "account_number"
> &
  Partial<Pick<ReceivingAccount, "label" | "money_changer_partner_id">>;

/** No `is_active` here — deactivation is its own explicit action
 * (setReceivingAccountActive), not a generic field update, matching
 * lib/masterData.service.ts's own setMasterDataActive precedent.
 * `money_changer_partner_id` is included so it can be both set and
 * explicitly cleared back to NULL via the same update path (Phase 2's
 * "clearing it back to NULL" requirement) — a bare `Partial` already
 * allows `null` here since the source field's own type is
 * `string | null`. */
export type UpdateReceivingAccountInput = Partial<
  Pick<ReceivingAccount, "bank_id" | "owner_partner_id" | "currency" | "account_number" | "label" | "money_changer_partner_id">
>;
