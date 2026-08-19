import { ConsignmentStatus } from "@/types/consignment";

/** Consignment Overview (Product Owner Reporting/Usability Gap, resolved
 * within the Consignment module's own existing list/detail pages — no
 * Reporting/BI Revision required, since this is a per-row operational
 * view, not an aggregate summary, and every field is either already owned
 * by Consignment (D10) or reached via the existing Order/Customer
 * relationship, never a new one. Every figure here is read-only — nothing
 * here is a second source of truth for Fee/Payable/Sale Price (D1/D2,
 * unchanged), Order (unchanged, still Source of Truth for Sale), or
 * Settlement (unchanged). */
export interface ConsignmentOverviewRow {
  consignmentId: string;
  consignmentCode: string;
  status: ConsignmentStatus;

  productId: string;
  productCode: string;
  productName: string;

  consignorId: string;
  consignorName: string;

  /** consignments.created_at — the moment the Consignment was received
   * (D9/D02, unchanged; RECEIVED is set at creation). */
  receivedAt: string;
  /** consignments.returned_at — set only when status = RETURNED. */
  returnedAt: string | null;
  /** Days held, computed from already-existing timestamps only (no new
   * business rule): (Sale Date or Return Date or now()) minus Received
   * Date. See consignmentOverview.service.ts for the exact source per
   * status. */
  holdingDays: number;

  /** Present only once the Consignment has sold (a Consignment Financial
   * Record exists, D11) — null for RECEIVED/AVAILABLE_FOR_SALE/RETURNED. */
  orderId: string | null;
  orderNumber: string | null;
  buyerId: string | null;
  buyerName: string | null;
  /** orders.sales_owner (docs/03_ORDER_SPEC.md §5) — Order remains the
   * sole source of truth for this; Consignment never stores its own
   * salesperson relationship. */
  salesperson: string | null;
  /** consignment_financial_records.created_at — the most precise "sale
   * finalized" timestamp available anywhere in the system today (written
   * once, at Order Completion); `orders` itself has no dedicated
   * completed_at column. */
  saleDate: string | null;
  salePrice: number | null;
  fee: number | null;
  customerPayable: number | null;
  /** Derived from whether this specific Consignment Financial Record is
   * referenced by a Completed Consignment Settlement Item — the same
   * per-record logic already used in aggregate by
   * getConsignmentOutstandingByCustomerId, now exposed per row. Never
   * independently stored (matches D2/D11's write-once, live-derived
   * discipline). */
  customerPaid: number | null;
  customerOutstanding: number | null;
}
