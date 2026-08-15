/** Compensation (docs/13_COMPENSATION_SPEC.md, LOCKED Rev 3). Compensation
 * owns Type/Policy/Basis/Method/Eligibility only — never Partner, Customer,
 * Product, Order, Payment, or Settlement data (§2). Recipient is Compensation's
 * own abstract concept (§1) — `recipient_type`/`partner_id` below only
 * reflect this increment's scope decision (Partner-sourced recipients only,
 * since Order's own `partner_id` is the only wired recipient-type data that
 * exists today; Commission stays entirely separate, Staff-earned, untouched). */

/** Product Owner Revision (2026-07-31, Module: Compensation) — full
 * 5-value status model, reversing the prior implementation's LOCKED-3-value
 * decision. Draft/Cancelled are now explicitly required. See
 * lib/compensation/compensation.service.ts for the full lifecycle:
 * Draft (created at OrderConfirmed) -> Pending (Eligibility evaluated at
 * OrderCompleted, per Decision 2 "Eligibility may delay confirmation... but
 * must never change the creation trigger") -> Confirmed (manual,
 * compensation.manage, Payment Status = Paid gate) -> Handed Off (to
 * Settlement — status exists, no action reaches it, Settlement is
 * unbuilt). Cancelled is reachable from Draft/Pending only, when the
 * underlying Order is marked Lost. */
export type CompensationStatus = "Draft" | "Pending" | "Confirmed" | "Cancelled" | "Handed Off";
export type CompensationType = "Commission" | "Bonus" | "Referral Fee" | "Incentive" | "Rebate";
export type CompensationBasis = "Sale Price" | "Received Amount" | "Profit" | "Fixed Value";
export type CompensationMethod = "Percentage" | "Fixed Amount" | "Manual";

export interface Compensation {
  id: string;
  compensation_code: string;

  recipient_type: string;
  partner_id: string | null;
  /** Populated by a join when fetched with partner — never write this back. */
  partner?: { id: string; name: string; partner_code: string; partner_type: string; status: string } | null;

  compensation_type: string;
  policy_id: string | null;

  order_id: string;
  order_item_id: string | null;
  customer_id: string | null;
  product_id: string | null;
  /** Populated by joins when fetched — never write these back. */
  order?: { id: string; order_number: string; order_date: string } | null;
  customer?: { id: string; full_name: string; customer_code: string } | null;
  product?: { id: string; product_name: string; product_code: string } | null;

  basis: string;
  method: string;
  value: number;
  calculated_amount: number;

  status: CompensationStatus;
  confirmed_at?: string | null;
  confirmed_by?: string | null;
  cancelled_at?: string | null;

  created_at?: string;
  updated_at?: string;
}

export interface CompensationPolicy {
  id: string;
  policy_name: string;
  compensation_type: string;
  basis: string;
  method: string;
  value: number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export type CreateCompensationPolicyInput = Pick<
  CompensationPolicy,
  "policy_name" | "compensation_type" | "basis" | "method" | "value" | "status"
>;

export type UpdateCompensationPolicyInput = Partial<CreateCompensationPolicyInput>;
