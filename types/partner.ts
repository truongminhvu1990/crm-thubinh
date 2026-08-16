/** Partner Center (docs/12_PARTNER_CENTER_SPEC.md, LOCKED Rev 3). Partner
 * Center owns Partner identity/relationship/status/attribution ONLY — never
 * Customer, Order, Payment, Product, Compensation, or Settlement data (§3). */

/** §4/§5 — proposed lifecycle, confirmed by Product Owner Implementation Task
 * 2026-07-31 (resolves docs/12_PARTNER_CENTER_SPEC.md §13 Q1). Free-text
 * column, not a DB CHECK constraint — validated at the application layer
 * (see PARTNER_STATUS_OPTIONS) so a future status can be added without a
 * migration, consistent with the project's Extensibility principle. */
export type PartnerStatus = "Onboarding" | "Active" | "Inactive" | "Terminated";

/** §6 — starting set, explicitly "not assumed final" in the LOCKED spec.
 * Stored as free text (not an enum/CHECK), same reasoning as PartnerStatus.
 * "Money Changer"/"Supplier" added per docs/19_MONEY_DEBT_LEDGER_SPEC.md §6/D2
 * (Money & Debt Ledger Implementation, 2026-08-15) — financial-counterparty
 * roles, distinct from the original sales-side set; `partners.partner_type`
 * itself was never CHECK-constrained, so this union documents the allowed
 * set without requiring a migration (same reasoning as PartnerStatus). This
 * `Partner` interface's own `partner_type` field remains plain `string`
 * below (unchanged) — this union is not (and was never) enforced by the
 * compiler against it. */
export type PartnerType = "Collaborator" | "Sales Agent" | "Dealer" | "Affiliate" | "Referral Partner" | "Money Changer" | "Supplier";

export interface Partner {
  id: string;
  /** System-generated, format PTR-{YYYYMMDD}-{6-digit sequence} — mirrors
   * Orders' own order_number generation (lib/orders/order.repository.ts
   * generateOrderNumber). Not user-entered — absent from Create Partner's
   * own required-fields list. */
  partner_code: string;
  name: string;
  partner_type: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  status: PartnerStatus;
  created_at?: string;
  updated_at?: string;
}

export type CreatePartnerInput = Pick<Partner, "name" | "partner_type" | "status"> &
  Partial<Pick<Partner, "phone" | "email" | "address" | "notes">>;

export type UpdatePartnerInput = Partial<
  Pick<Partner, "name" | "partner_type" | "phone" | "email" | "address" | "notes" | "status">
>;
