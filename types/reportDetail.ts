/** Phase 1.6 - Reporting contextual drawer. Read-only DTOs returned by
 * /api/reports/detail/{order|product|customer|inventory}/[id]. Deliberately
 * narrower than the underlying tables: no address, no receiving-account /
 * bank details, no cost or margin fields. */

export type DetailEntityType = "order" | "product" | "customer" | "inventory";

export const DETAIL_ENTITY_TYPES: readonly DetailEntityType[] = ["order", "product", "customer", "inventory"];

export interface DetailCustomerRef {
  id: string;
  customer_code: string | null;
  full_name: string;
}

export interface DetailOrderRef {
  order_id: string;
  order_number: string;
  order_date: string;
  order_status: string;
  payment_status: string;
  /** Order-level total (cả đơn). */
  total_amount: number;
}

export interface OrderDetailItem {
  item_id: string;
  product_id: string;
  product_code: string | null;
  product_name: string | null;
  /** Product level: giá bán cuối (per unit snapshot). */
  unit_price: number;
  quantity: number;
  discount: number;
  /** Product level: thành tiền dòng. */
  line_total: number;
  is_gift: boolean;
}

export interface OrderDetailPayment {
  amount: number;
  payment_method: string;
  payment_date: string;
}

export interface OrderDrawerData {
  order: DetailOrderRef & { sales_owner: string | null };
  customer: DetailCustomerRef | null;
  items: OrderDetailItem[];
  /** Order level only: payments belong to the whole order, never to a line. */
  totals: { total_amount: number; amount_paid: number; remaining_balance: number };
  payments: OrderDetailPayment[];
}

export interface ProductSummary {
  id: string;
  product_code: string | null;
  product_name: string | null;
  category: string | null;
  status: string;
  sale_price: number | null;
  batch_id: string | null;
}

export interface ProductOrderLink extends DetailOrderRef {
  customer: DetailCustomerRef | null;
  quantity: number;
  /** Product level: thành tiền dòng of THIS product in that order. */
  line_total: number;
}

export interface ProductDrawerData {
  product: ProductSummary;
  /** Only orders the caller's Orders data scope allows. */
  orders: ProductOrderLink[];
}

export interface CustomerDrawerData {
  customer: DetailCustomerRef & { phone: string | null };
  /** Only orders the caller's Orders data scope allows. */
  orders: DetailOrderRef[];
  summary: { order_count: number; total_order_value: number | null; truncated: boolean };
}

export interface InventoryDrawerData {
  product: ProductSummary;
  /** held = Reserved, remaining = Available (locked inventory definitions). */
  bucket: "held" | "remaining" | "sold" | "other";
  holding_order:
    | (DetailOrderRef & {
        customer: DetailCustomerRef | null;
        /** Order level (cả đơn). */
        amount_paid: number;
        remaining_balance: number;
      })
    | null;
}
