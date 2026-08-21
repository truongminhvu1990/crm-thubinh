export type OrderStatus = "Draft" | "Reserved" | "Completed" | "Lost";
export type PaymentStatus = "Unpaid" | "Partially Paid" | "Paid";
/** Product Owner Decision 12a/Business Rule (LOCKED) — the only two Methods
 * a user may pick for an Order's own Compensation. Not the same concept as
 * CompensationMethod (types/compensation.ts), which also allows "Manual"
 * for Policy configuration — that value is never valid here. */
export type OrderCompensationMethod = "Percentage" | "Fixed Amount";

export interface Order {
  id?: string;
  order_number: string;
  customer_id: string;
  /** Populated by a join when fetched with customer — never write this back. */
  customer?: { id: string; full_name: string; customer_code: string; phone?: string } | null;
  /** Partner Attribution (docs/12_PARTNER_CENTER_SPEC.md §7, confirmed;
   * field added per Product Owner Revision 2026-07-31, Decision 4). Optional
   * — an Order may exist without a Partner. Storage only: no Compensation
   * calculation, Settlement, or Business Event is triggered by this field. */
  partner_id?: string | null;
  /** Order-level Compensation selection (Product Owner Decision 12a, LOCKED)
   * — the user's direct Method + Value choice for THIS Order's Partner,
   * read straight by createCompensationsForOrder instead of any
   * Compensation Policy lookup. Required together whenever partner_id is
   * set (order.validation.ts); both null when there is no Partner.
   * Type-only compatibility declaration for the isolated Compensation
   * release — no UI, validation, or database column ships with it here;
   * those belong to the separate, not-yet-authorized Orders compensation
   * selection feature (migration 2026081601). */
  compensation_method?: OrderCompensationMethod | null;
  compensation_value?: number | null;
  sales_owner: string;
  created_by: string;
  order_date: string;
  lost_reason?: string | null;
  subtotal: number;
  discount_total: number;
  total_amount: number;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OrderItem {
  id?: string;
  order_id: string;
  product_id: string;
  /** Populated by a join when fetched with product — never write this back. Per Spec §9, nothing about the product besides id/name/code/certificate is ever duplicated onto this row. */
  product?: { id: string; product_name: string; product_code: string; certificate_no?: string | null } | null;
  snapshot_sale_price: number;
  discount: number;
  quantity: number;
  line_total: number;
  is_gift: boolean;
  gift_recipient_name?: string | null;
  gift_note?: string | null;
  packaging_option?: string | null;
}

export interface OrderPayment {
  id?: string;
  order_id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  note?: string | null;
  created_at?: string;
  /** Payment / Bank Account / Money-Debt domain redesign, Stage 3 — WHERE
   * the money was received, independent of payment_method (HOW it was
   * paid). Always null for Cash/PayPal-style methods; only meaningful when
   * payment_method is a bank-transfer-style value (see
   * order.validation.ts's validateReceivingAccountSelection). Never
   * auto-populated, never implies a Money & Debt Ledger counterparty by
   * itself. */
  receiving_account_id?: string | null;
  /** Populated by a join when fetched with its receiving account — never
   * write this back. Absent/null for every payment that has no
   * receiving_account_id. */
  receiving_account?: {
    id: string;
    currency: string;
    account_number: string;
    label?: string | null;
    bank?: { value: string } | null;
    owner?: { name: string } | null;
  } | null;
}

export interface OrderEvent {
  id?: string;
  order_id: string;
  event_type: string;
  event_detail: string;
  actor: string;
  event_timestamp: string;
}

/** The fixed event-type picklist named in ORDERS_SPEC.md §8. */
export type OrderEventType =
  | "Order Created"
  | "Product Added"
  | "Product Removed"
  | "Price Changed"
  | "Payment Added"
  | "Status Changed"
  | "Sales Owner Reassigned"
  | "Marked Lost";

// ---------------------------------------------------------------------------
// Write-operation DTOs (ORDERS_SPEC.md §2-§8, ORDERS_DATABASE.md §4).
// Contracts only — implementations land once the Development DB reset
// (ORDERS_IMPLEMENTATION_PLAN.md Task 1) is applied.
// ---------------------------------------------------------------------------

export interface CreateOrderInput {
  customer_id: string;
  sales_owner: string;
  created_by: string;
  /** Order Sale Date (Backdated Order support). The actual date the sale
   * happened — independent of created_at (system record-creation time,
   * always "now"). Optional: when omitted, order.repository.ts's
   * createOrder() defaults it to today's Vietnam business date, same as
   * before this field existed. */
  order_date?: string;
}

export interface AddOrderItemInput {
  order_id: string;
  product_id: string;
  snapshot_sale_price: number;
  discount: number;
  quantity: number;
  is_gift: boolean;
  gift_recipient_name?: string | null;
  gift_note?: string | null;
  packaging_option?: string | null;
}

export interface UpdateOrderItemInput {
  id: string;
  order_id: string;
  snapshot_sale_price?: number;
  discount?: number;
  quantity?: number;
  is_gift?: boolean;
  gift_recipient_name?: string | null;
  gift_note?: string | null;
  packaging_option?: string | null;
}

export interface AddPaymentInput {
  order_id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  note?: string | null;
  /** See OrderPayment.receiving_account_id. Required when payment_method
   * is a bank-transfer-style value, must be omitted/null otherwise —
   * enforced by order.validation.ts's validateReceivingAccountSelection. */
  receiving_account_id?: string | null;
}

export interface MarkOrderLostInput {
  order_id: string;
  lost_reason: string;
}

export interface ReassignSalesOwnerInput {
  order_id: string;
  sales_owner: string;
}

/** The generic Update Order workflow's input — deliberately narrower than
 * the repository's `updateOrder(id, changes: Partial<Order>)`. Excludes
 * sales_owner/lost_reason: both already have their own business-rule-gated
 * workflow (reassignSalesOwner/markOrderLost); exposing them here too would
 * open a second, differently-validated path to the same fields. */
export interface UpdateOrderInput {
  order_id: string;
  order_date?: string;
  note?: string | null;
}

/** The rollup fields the service layer recomputes and persists after any
 * order_items/payments mutation (ORDERS_DATABASE.md §4: Subtotal/Discount
 * total/Total amount/Payment status are all "Derived"). */
export interface OrderRollups {
  subtotal: number;
  discount_total: number;
  total_amount: number;
  payment_status: PaymentStatus;
}
