export type OrderStatus = "Draft" | "Reserved" | "Completed" | "Lost";
export type PaymentStatus = "Unpaid" | "Partially Paid" | "Paid";

export interface Order {
  id?: string;
  order_number: string;
  customer_id: string;
  /** Populated by a join when fetched with customer — never write this back. */
  customer?: { id: string; full_name: string; customer_code: string; phone?: string } | null;
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
