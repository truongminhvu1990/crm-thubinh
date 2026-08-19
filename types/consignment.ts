/** Consignment (CRM Customer Consignment specification — Business Model
 * LOCKED, Design Specification RESOLVED, Implementation AUTHORIZED). Owns
 * the consignment relationship and its own lifecycle only — never Customer
 * or Product data (D9/D10). Consignor is the existing Customer entity
 * (D9) — no new identity concept. Product's own Status is never read or
 * written here (D7/D01, LOCKED — Product Status non-interference).
 *
 * Status model (D02/D01, LOCKED): RECEIVED -> AVAILABLE_FOR_SALE -> SOLD,
 * or RECEIVED/AVAILABLE_FOR_SALE -> RETURNED. No CANCELLED state this
 * phase. SOLD is set only by the Order-integration increment (not yet
 * implemented — see lib/consignment/consignment.service.ts's own header
 * comment); this increment implements RECEIVED, AVAILABLE_FOR_SALE, and
 * RETURNED only. */

export type ConsignmentStatus = "RECEIVED" | "AVAILABLE_FOR_SALE" | "SOLD" | "RETURNED";

export interface Consignment {
  id: string;
  consignment_code: string;

  customer_id: string;
  /** Populated by a join when fetched — never write this back. */
  customer?: { id: string; full_name: string; customer_code: string } | null;

  product_id: string;
  /** Populated by a join when fetched — never write this back. */
  product?: { id: string; product_name: string; product_code: string; status: string } | null;

  status: ConsignmentStatus;
  returned_at?: string | null;

  created_at?: string;
  updated_at?: string;
}

export type CreateConsignmentInput = Pick<Consignment, "customer_id" | "product_id">;
