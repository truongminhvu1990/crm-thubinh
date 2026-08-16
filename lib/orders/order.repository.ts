import { supabase } from "@/lib/supabase";
import {
  AddOrderItemInput,
  AddPaymentInput,
  CreateOrderInput,
  MarkOrderLostInput,
  Order,
  OrderEvent,
  OrderItem,
  OrderPayment,
  OrderRollups,
  ReassignSalesOwnerInput,
  UpdateOrderItemInput,
} from "@/types/order";
import { computeLineTotal } from "./order.rules";
import { Staff } from "@/types/staff";
import { applyDataScopeByName } from "@/lib/permission/dataScope";
import { CommissionStatus } from "@/types/commission";
import { CompensationStatus } from "@/types/compensation";
import { BusinessTime } from "@/lib/businessTime";
import { createAdminClient } from "@/lib/supabase/admin";

/** Orders -> Sales Snapshot Integration. One element per order_item, built
 * by order.service.ts's completeOrder() and handed to the
 * complete_order_with_snapshots RPC below as-is - every field here is
 * already a business decision made in TypeScript (Rules 3-7), this type
 * carries no logic of its own. */
export interface PurchaseSnapshotInput {
  id: string;
  customer_id: string;
  product_id: string;
  sale_price: number;
  sale_date: string;
  source: string | null;
  salesperson: string | null;
  salesperson_id: string | null;
  order_item_id: string;
}

/** Same role as PurchaseSnapshotInput, for the paired sales_commissions
 * row - commission_percent/commission_amount are already the output of
 * the real findMatchingRule()/calculateCommissionAmount() (Rule 9), never
 * recomputed here or in the RPC. */
export interface CommissionSnapshotInput {
  id: string;
  purchase_id: string;
  customer_id: string;
  salesperson: string | null;
  salesperson_id: string | null;
  sale_amount: number;
  commission_percent: number;
  commission_amount: number;
  status: CommissionStatus;
}

/** Data Scope Rollout (Sprint v4.1), Package 2 - the shape `findAllOrders`/
 * `findOrderById` need to resolve Own/Team scope; optional everywhere it's
 * used so the existing `OrderReadRepository` interface (no staff
 * parameter) stays satisfied and every other caller's contract is
 * unchanged (a function with an extra optional parameter still satisfies
 * an interface method declared with fewer parameters). */
export type ScopingStaff = Pick<Staff, "id" | "role" | "role_id" | "team_id" | "full_name">;

/** Observability-only: which table each operation name touches, so
 * OrderRepositoryError can report `table` without changing every throw
 * call site above. Kept in sync with the `.from(...)` call inside each
 * function of the same name. */
const OPERATION_TABLE: Record<string, string> = {
  generateOrderNumber: "orders",
  createOrder: "orders",
  updateOrder: "orders",
  deleteOrder: "orders",
  reserveOrder: "orders",
  cancelReservation: "orders",
  completeOrder: "orders",
  markOrderLost: "orders",
  reassignSalesOwner: "orders",
  updateOrderRollups: "orders",
  addOrderItem: "order_items",
  updateOrderItem: "order_items",
  removeOrderItem: "order_items",
  reserveProduct: "products",
  releaseProduct: "products",
  markProductSold: "products",
  addPayment: "payments",
  appendOrderEvent: "order_events",
  findCompensationStatusesForOrder: "compensations",
  deleteOrderWithReconciliation: "orders",
};

/** Data-layer error thrown by every write method below on a Supabase error —
 * bridges Supabase's `{data, error}` tuple style to the throw-or-resolve
 * contract order.service.ts's orchestration already expects (see
 * ORDERS_SUPABASE_PLAN.md §4). Distinct from the Service layer's
 * OrderNotFoundError/OrderValidationError/OrderRuleViolationError. */
export class OrderRepositoryError extends Error {
  /** Table the failing operation targets — looked up from OPERATION_TABLE,
   * observability-only, does not affect message/response shape. */
  public readonly table: string;

  constructor(
    public readonly operation: string,
    public readonly cause: { message: string; code?: string; details?: string; hint?: string }
  ) {
    super(`OrderRepository.${operation} failed: ${cause.message}`);
    this.name = "OrderRepositoryError";
    this.table = OPERATION_TABLE[operation] ?? "unknown";
  }
}

/**
 * Admin/Owner Full Order Control (Product Owner Decision, 2026-08-14) —
 * deleteOrder's admin path has no remaining app-level status/payment/
 * compensation gate, but a Completed order still has a `customer_purchases`
 * row (written by `complete_order_with_snapshots`), and
 * `customer_purchases.order_item_id` has no `ON DELETE CASCADE` back from
 * `order_items` — Postgres raises SQLSTATE 23503 (foreign_key_violation)
 * when the cascade from `orders` reaches that row. This is a real database
 * constraint, not an app-level policy this task invented or is lifting —
 * distinguishing it as its own error type (rather than the generic
 * OrderRepositoryError -> 500) is purely about surfacing that fact clearly
 * to the caller instead of a raw 500. It does NOT change what is allowed —
 * the delete still fails exactly as it would without this class; only the
 * message does.
 */
export class OrderDeleteRevenueConflictError extends Error {
  constructor(orderId: string) {
    super(
      `Order ${orderId} cannot be deleted: it has recognized revenue/reporting records (customer_purchases) with no safe cascade path defined`
    );
    this.name = "OrderDeleteRevenueConflictError";
  }
}

// Raw data access only — no business rules, no derived fields. Business
// logic (item counts, derived fields) lives in order.service.ts, which
// composes these reads.

const WITH_CUSTOMER = "*, customer:customers(id, full_name, customer_code, phone)";
const WITH_PRODUCT = "*, product:products(id, product_name, product_code, certificate_no)";

export type OrderWithItemCount = Order & { order_items: { count: number }[] };

/** Every order, newest first, with its customer joined and its item count
 * embedded via PostgREST's aggregate count — avoids one round trip per row.
 *
 * Data Scope Rollout (Sprint v4.1), Package 2 - `staff` is optional and,
 * when provided, Own/Team is applied via `applyDataScopeByName` (Orders
 * has no uuid staff-reference column - `sales_owner` is text, matched to
 * `staff.full_name` case-insensitively and trimmed, DATA_SCOPE_ROLLOUT_
 * DATABASE.md §2 rule 3 / Decision 43). Applied during query construction,
 * before the request is sent - never a post-fetch filter. */
export async function findAllOrders(staff?: ScopingStaff): Promise<OrderWithItemCount[]> {
  let query = supabase
    .from("orders")
    .select(`${WITH_CUSTOMER}, order_items(count)`);

  if (staff) query = (await applyDataScopeByName(query, staff, "orders", "sales_owner")).query;

  const { data, error } = await query
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching orders:", error);
    return [];
  }

  return data as unknown as OrderWithItemCount[];
}

export async function findOrderById(id: string, staff?: ScopingStaff): Promise<Order | null> {
  let query = supabase.from("orders").select(WITH_CUSTOMER).eq("id", id);

  if (staff) query = (await applyDataScopeByName(query, staff, "orders", "sales_owner")).query;

  const { data, error } = await query.single();

  if (error) {
    // Scope-excluded and genuinely nonexistent orders both land here as the
    // same "no matching row" outcome, deliberately (DATA_SCOPE_ROLLOUT_UI.md
    // §3: out-of-scope access reads as "not found," never "forbidden").
    console.error("Error fetching order:", error);
    return null;
  }

  return data as unknown as Order;
}

export async function findOrderItemsByOrderId(orderId: string): Promise<OrderItem[]> {
  const { data, error } = await supabase
    .from("order_items")
    .select(WITH_PRODUCT)
    .eq("order_id", orderId);

  if (error) {
    console.error("Error fetching order items:", error);
    return [];
  }

  return data as unknown as OrderItem[];
}

/** Newest payment first, matching ORDERS_UI.md §8's Payment History convention. */
export async function findPaymentsByOrderId(orderId: string): Promise<OrderPayment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("order_id", orderId)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching payments:", error);
    return [];
  }

  return data as OrderPayment[];
}

/** Newest first — matches ORDERS_UI.md §9.2's reverse-chronological Order
 * Event Timeline convention. */
export async function findOrderEventsByOrderId(orderId: string): Promise<OrderEvent[]> {
  const { data, error } = await supabase
    .from("order_events")
    .select("*")
    .eq("order_id", orderId)
    .order("event_timestamp", { ascending: false });

  if (error) {
    console.error("Error fetching order events:", error);
    return [];
  }

  return data as OrderEvent[];
}

/** Orders that count toward Revenue Recognition (ORDERS_SPEC.md §5: Order
 * Status = Completed AND Payment Status = Paid), with `order_date` in
 * [start, end). Read-only — a filtered variant of findAllOrders for revenue
 * aggregation callers (e.g. Dashboard), not a new write path. */
export async function findRevenueRecognizedOrders(start: string, end: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("order_status", "Completed")
    .eq("payment_status", "Paid")
    .gte("order_date", start)
    .lt("order_date", end);

  if (error) {
    console.error("Error fetching revenue-recognized orders:", error);
    return [];
  }

  return data as Order[];
}

// ---------------------------------------------------------------------------
// Write implementations — orders. Per ORDERS_IMPLEMENTATION_PLAN.md Task 3 /
// this increment's explicit scope (orders + order_items CRUD only; payments/
// order_events stay contract-only for now).
// ---------------------------------------------------------------------------

/**
 * TEMPORARY, non-atomic order-number generator: counts today's orders and
 * increments. ORDERS_DATABASE.md §13 / ORDERS_SUPABASE_PLAN.md §3 Category A
 * both name atomic order-number generation as needing a dedicated Postgres
 * function requiring its own explicit Product Owner SQL approval — that is
 * a separate, not-yet-approved gate, out of scope for this increment. This
 * generator has a real race condition under concurrent order creation (two
 * requests counting "0 today" at once would both produce sequence 000001) —
 * flagged here, not hidden, and must be replaced once the atomic function
 * lands. Format per ORDERS_SPEC.md §3 Revision 5: `OD-{YYYYMMDD}-{6-digit
 * sequence}`, daily-reset.
 *
 * Business Time Migration, Wave 1: "today" here MUST be the Vietnam
 * business date (Locked Product Owner decision, Business Time Foundation)
 * — this runs server-side (POST /api/orders), where `new Date()` is the
 * Node/Vercel runtime's clock, confirmed UTC. Sourced from
 * BusinessTime.todayString() only — no separate date computation.
 */
async function generateOrderNumber(): Promise<string> {
  const datePart = BusinessTime.todayString().replace(/-/g, "");
  const prefix = `OD-${datePart}-`;

  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .like("order_number", `${prefix}%`);

  if (error) {
    throw new OrderRepositoryError("generateOrderNumber", error);
  }

  const sequence = (data?.length ?? 0) + 1;
  return `${prefix}${String(sequence).padStart(6, "0")}`;
}

/** Fields a generic `updateOrder` call may change. Excludes: `id`/`order_number`
 * (immutable, ORDERS_DATABASE.md §8), `customer_id` (no business rule permits
 * reassigning an order's customer), `created_by` (immutable audit field, §4
 * "Native, set once, never re-derived"), `order_status`/`payment_status`
 * (status transitions go through their own dedicated methods —
 * markOrderLost/completeOrder — which the Service layer gates with business
 * rules; allowing them here too would open a rule-bypassing second path),
 * `subtotal`/`discount_total`/`total_amount` (Derived, §4 — written only by
 * updateOrderRollups), `created_at`/`updated_at` (system-managed). */
const ORDER_WRITABLE_FIELDS: (keyof Order)[] = ["sales_owner", "order_date", "lost_reason", "note"];

function pickOrderWritableFields(changes: Partial<Order>): Partial<Order> {
  const filtered: Record<string, unknown> = {};
  ORDER_WRITABLE_FIELDS.forEach((field) => {
    const value = changes[field];
    if (value !== undefined) filtered[field] = value;
  });
  return filtered as Partial<Order>;
}

/** Business Time Migration, Wave 1: `order_date` is set explicitly here
 * (Vietnam business date, via BusinessTime) rather than left to the
 * `orders.order_date` column's own DB default — the column default still
 * exists (also migrated to Vietnam time, see
 * 20260805_business_time_orders_write_path.sql, defense-in-depth for any
 * non-app insert path) but this is now the one place that actually
 * determines the value for every order the app creates. `CreateOrderInput`
 * itself is unchanged — this is an internal repository detail, not a new
 * request field. */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const order_number = await generateOrderNumber();
  const order_date = BusinessTime.todayString();

  const { data, error } = await supabase
    .from("orders")
    .insert({ ...input, order_number, order_date })
    .select()
    .single();

  if (error) {
    console.error("Error creating order:", error);
    throw new OrderRepositoryError("createOrder", error);
  }

  return data as Order;
}

/** Generic field update — see ORDER_WRITABLE_FIELDS above for exactly which
 * fields this can touch. Status transitions and rollups go through their
 * own dedicated methods, not this one. */
export async function updateOrder(id: string, changes: Partial<Order>): Promise<Order> {
  const filteredData = pickOrderWritableFields(changes);

  const { data, error } = await supabase
    .from("orders")
    .update(filteredData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating order:", error);
    throw new OrderRepositoryError("updateOrder", error);
  }

  return data as Order;
}

/**
 * Deletes an order — restricted to `order_status = 'Draft'` AND
 * `payment_status = 'Unpaid'` directly in the query's WHERE clause, matching
 * ORDERS_DATABASE.md §7's framing of order deletion as "a data-integrity
 * backstop, not a supported workflow": a Draft order with no payment logged
 * is the one state where a hard delete carries no data-integrity risk.
 * order_items/payments/order_events all cascade-delete via their FK
 * (`ON DELETE CASCADE` to orders.id, ORDERS_DATABASE.md §2) — this single
 * DELETE is sufficient, no separate per-table delete is needed. Defense in
 * depth alongside the Service layer's validateOrderDeletion check (same
 * rule, not a new one). Silently deletes 0 rows (no error) if the order
 * doesn't match both conditions or doesn't exist, matching this codebase's
 * existing deleteCustomer/deleteProduct behavior of returning the (possibly
 * null) Supabase error rather than asserting a row was actually affected.
 */
/**
 * Admin/Owner Full Order Control (Product Owner Decision, 2026-08-14,
 * SUPERSEDES the WHERE clause this doc comment used to describe): the
 * admin path is now a plain delete-by-id — no status/payment/compensation
 * condition remains here at all. The non-admin path is unchanged (Draft +
 * Unpaid only, same as always).
 *
 * This does not make every admin delete succeed: `order_items` still
 * `ON DELETE CASCADE`s from `orders`, and a Completed order's
 * `customer_purchases` row (via `order_item_id`, no cascade defined) will
 * still block that cascade at the database layer with a real foreign-key
 * violation (SQLSTATE 23503) — caught below and re-thrown as
 * OrderDeleteRevenueConflictError so the caller gets a clear signal instead
 * of a raw 500.
 */
export async function deleteOrder(id: string, adminOverride = false): Promise<void> {
  let query = supabase.from("orders").delete().eq("id", id);
  if (!adminOverride) {
    query = query.eq("order_status", "Draft").eq("payment_status", "Unpaid");
  }

  const { error } = await query;

  if (error) {
    if (error.code === "23503") {
      throw new OrderDeleteRevenueConflictError(id);
    }
    console.error("Error deleting order:", error);
    throw new OrderRepositoryError("deleteOrder", error);
  }
}

/**
 * Admin Order Deletion pre-checks (Product Owner Decision, 2026-08-14) — a
 * plain existence/status read against `compensations`, not a Compensation
 * module integration. The service layer refuses to proceed if any status
 * here is 'Confirmed' or 'Handed Off' (LOCKED Traceability principle) —
 * this function only reads, never decides. The same condition is
 * independently re-enforced inside delete_order_with_reconciliation itself
 * (2026081717 migration) as a second, database-level layer.
 */
export async function findCompensationStatusesForOrder(orderId: string): Promise<CompensationStatus[]> {
  const { data, error } = await supabase.from("compensations").select("status").eq("order_id", orderId);

  if (error) {
    console.error("Error checking compensation statuses for order:", error);
    throw new OrderRepositoryError("findCompensationStatusesForOrder", error);
  }

  return (data || []).map((row) => row.status as CompensationStatus);
}

/**
 * Admin Order Deletion's transactional reconciliation — see
 * supabase/migrations/2026081702_admin_order_delete_reconciliation.sql for
 * the exact deletion sequence and why each step is safe, and
 * supabase/migrations/2026081717_admin_order_delete_execute_privilege_fix.sql
 * for the database-level authorization this call now depends on.
 *
 * Security boundary (2026-08-16): delete_order_with_reconciliation is
 * SECURITY DEFINER, granted to `service_role` only (never `anon`/
 * `authenticated`) — the browser can never reach it directly, and this is
 * the ONLY place in the codebase that calls it. `staffId` is the
 * server-verified actor (already role-checked by
 * app/api/orders/[id]/route.ts's authorizeOrderWrite before this is ever
 * reached) — the RPC independently re-verifies that staff id resolves to
 * an active Owner role and that no Confirmed/Handed-Off compensation
 * exists, so this call is safe even if some future caller forgot the
 * app-level checks.
 */
export async function deleteOrderWithReconciliation(staffId: string, orderId: string): Promise<void> {
  const adminClient = createAdminClient();
  const { error } = await adminClient.rpc("delete_order_with_reconciliation", {
    p_staff_id: staffId,
    p_order_id: orderId,
  });

  if (error) {
    console.error("Error deleting order with reconciliation:", error);
    throw new OrderRepositoryError("deleteOrderWithReconciliation", error);
  }
}

/**
 * Draft → Reserved only — a dedicated, narrow method, not a generic status
 * setter (per this increment's explicit instruction). The `.eq("order_status",
 * "Draft")` guard means this can only ever affect a row that's currently
 * Draft; if the order isn't Draft (or doesn't exist), the update matches 0
 * rows and `.single()` surfaces that as an error rather than silently
 * succeeding on nothing — the Service layer's own transition check
 * (isValidOrderStatusTransition) is the primary gate, this is defense in
 * depth at the data layer, mirroring deleteOrder's WHERE-clause restriction.
 */
export async function reserveOrder(orderId: string): Promise<Order> {
  const { data, error } = await supabase
    .from("orders")
    .update({ order_status: "Reserved" })
    .eq("id", orderId)
    .eq("order_status", "Draft")
    .select()
    .single();

  if (error) {
    console.error("Error reserving order:", error);
    throw new OrderRepositoryError("reserveOrder", error);
  }

  return data as Order;
}

/** Reserved → Draft only — same dedicated-method, WHERE-guarded pattern as
 * reserveOrder above, in the opposite direction. */
export async function cancelReservation(orderId: string): Promise<Order> {
  const { data, error } = await supabase
    .from("orders")
    .update({ order_status: "Draft" })
    .eq("id", orderId)
    .eq("order_status", "Reserved")
    .select()
    .single();

  if (error) {
    console.error("Error cancelling reservation:", error);
    throw new OrderRepositoryError("cancelReservation", error);
  }

  return data as Order;
}

/** Draft or Reserved → Completed only (both are valid sources per
 * ORDERS_UI.md §6's action table) — same WHERE-guarded pattern, using
 * `.in()` since there are two valid starting statuses instead of one. */
/** Orders -> Sales Snapshot Integration. Replaces the old plain
 * `UPDATE orders SET order_status = 'Completed' ...` with a single call to
 * complete_order_with_snapshots (supabase/migrations/20260802_orders_
 * sales_snapshot_integration.sql) - the Draft/Reserved-only guard moved
 * into that function's own UPDATE...WHERE, so behavior on an
 * already-Completed order is unchanged (still throws), it's just enforced
 * inside the same transaction as the two new inserts now instead of a
 * separate statement. Purchase/commission rows are pure data by the time
 * they reach here - order.service.ts has already made every business
 * decision (which rule matched, what the amount is) before calling this. */
export async function completeOrder(
  orderId: string,
  purchaseRows: PurchaseSnapshotInput[],
  commissionRows: CommissionSnapshotInput[]
): Promise<Order> {
  const { data, error } = await supabase.rpc("complete_order_with_snapshots", {
    p_order_id: orderId,
    p_purchase_rows: purchaseRows,
    p_commission_rows: commissionRows,
  });

  if (error) {
    console.error("Error completing order with snapshots:", error);
    throw new OrderRepositoryError("completeOrder", error);
  }

  return data as Order;
}

/** Draft or Reserved → Lost only (ORDERS_SPEC.md §4), setting lost_reason
 * in the same update. */
export async function markOrderLost(input: MarkOrderLostInput): Promise<Order> {
  const { data, error } = await supabase
    .from("orders")
    .update({ order_status: "Lost", lost_reason: input.lost_reason })
    .eq("id", input.order_id)
    .in("order_status", ["Draft", "Reserved"])
    .select()
    .single();

  if (error) {
    console.error("Error marking order lost:", error);
    throw new OrderRepositoryError("markOrderLost", error);
  }

  return data as Order;
}

/** Draft or Reserved only (ORDERS_SPEC.md §6: reassignable "while the order
 * is open"), same WHERE-guard pattern as the other status-adjacent methods. */
export async function reassignSalesOwner(input: ReassignSalesOwnerInput): Promise<Order> {
  const { data, error } = await supabase
    .from("orders")
    .update({ sales_owner: input.sales_owner })
    .eq("id", input.order_id)
    .in("order_status", ["Draft", "Reserved"])
    .select()
    .single();

  if (error) {
    console.error("Error reassigning sales owner:", error);
    throw new OrderRepositoryError("reassignSalesOwner", error);
  }

  return data as Order;
}

/** Persists rollup fields the service layer recomputes after every
 * order_items/payments mutation (ORDERS_DATABASE.md §4, "Derived") — no
 * status guard, since payments can be recorded regardless of order status
 * (ORDERS_SPEC.md §5). */
export async function updateOrderRollups(orderId: string, rollups: OrderRollups): Promise<Order> {
  const { data, error } = await supabase
    .from("orders")
    .update(rollups)
    .eq("id", orderId)
    .select()
    .single();

  if (error) {
    console.error("Error updating order rollups:", error);
    throw new OrderRepositoryError("updateOrderRollups", error);
  }

  return data as Order;
}

// ---------------------------------------------------------------------------
// Write implementations — order_items.
// ---------------------------------------------------------------------------

/** Fields directly settable on an order_item. Excludes: `id`/`order_id`
 * (identity), `product_id` (no business rule permits changing which product
 * a line refers to after creation — UpdateOrderItemInput's type already
 * omits it), `line_total` (Derived, ORDERS_DATABASE.md §4 — always computed
 * here from snapshot_sale_price/discount/quantity via order.rules.ts's
 * computeLineTotal, never accepted directly from a caller). */
const ORDER_ITEM_WRITABLE_FIELDS: (keyof OrderItem)[] = [
  "snapshot_sale_price",
  "discount",
  "quantity",
  "is_gift",
  "gift_recipient_name",
  "gift_note",
  "packaging_option",
];

function pickOrderItemWritableFields(changes: Partial<OrderItem>): Partial<OrderItem> {
  const filtered: Record<string, unknown> = {};
  ORDER_ITEM_WRITABLE_FIELDS.forEach((field) => {
    const value = changes[field];
    if (value !== undefined) filtered[field] = value;
  });
  return filtered as Partial<OrderItem>;
}

export async function addOrderItem(input: AddOrderItemInput): Promise<OrderItem> {
  const line_total = computeLineTotal(input.snapshot_sale_price, input.discount, input.quantity);

  const { data, error } = await supabase
    .from("order_items")
    .insert({ ...input, line_total })
    .select()
    .single();

  if (error) {
    console.error("Error adding order item:", error);
    throw new OrderRepositoryError("addOrderItem", error);
  }

  return data as OrderItem;
}

/**
 * `UpdateOrderItemInput` is partial, but line_total must reflect the final
 * (post-update) price/discount/quantity — so this fetches the current row,
 * merges the partial change onto it, recomputes line_total from the merged
 * values via the same computeLineTotal already used by addOrderItem (no
 * duplicated formula), then writes the full merged set in one update.
 */
export async function updateOrderItem(input: UpdateOrderItemInput): Promise<OrderItem> {
  const { data: current, error: fetchError } = await supabase
    .from("order_items")
    .select("*")
    .eq("id", input.id)
    .single();

  if (fetchError) {
    console.error("Error fetching order item for update:", fetchError);
    throw new OrderRepositoryError("updateOrderItem", fetchError);
  }

  const filteredChanges = pickOrderItemWritableFields(input);
  const merged = { ...(current as OrderItem), ...filteredChanges };
  const line_total = computeLineTotal(merged.snapshot_sale_price, merged.discount, merged.quantity);

  const { data, error } = await supabase
    .from("order_items")
    .update({ ...filteredChanges, line_total })
    .eq("id", input.id)
    .select()
    .single();

  if (error) {
    console.error("Error updating order item:", error);
    throw new OrderRepositoryError("updateOrderItem", error);
  }

  return data as OrderItem;
}

export async function removeOrderItem(orderId: string, id: string): Promise<void> {
  const { error } = await supabase.from("order_items").delete().eq("id", id).eq("order_id", orderId);

  if (error) {
    console.error("Error removing order item:", error);
    throw new OrderRepositoryError("removeOrderItem", error);
  }
}

// ---------------------------------------------------------------------------
// Write implementations — product lifecycle (ORDERS_SPEC.md §7: Available →
// Reserved on add to an order's line items, Reserved → Sold on Completion,
// Reserved → Available on Marked Lost). Orders is the sole writer of these
// transitions; Inventory (docs/INVENTORY_SPEC.md) only ever reads
// `products.status`. Same "dedicated, narrow, WHERE-guarded method" pattern
// already used for order status above (reserveOrder/completeOrder/
// markOrderLost) — not a new architecture, just applied to `products`.
// ---------------------------------------------------------------------------

/** Available → Reserved. Guarded on `status = 'Active'`, which is what makes
 * this the actual concurrency check ORDERS_SPEC.md §9/§17 requires: if
 * another order already holds this product (or it isn't sellable for any
 * other reason), the guard matches 0 rows and this throws instead of
 * layering a second reservation on top. */
export async function reserveProduct(productId: string): Promise<void> {
  const { data, error } = await supabase
    .from("products")
    .update({ status: "Reserved" })
    .eq("id", productId)
    .eq("status", "Active")
    .select("id");

  if (error) {
    throw new OrderRepositoryError("reserveProduct", error);
  }
  if (!data || data.length === 0) {
    throw new OrderRepositoryError("reserveProduct", {
      message: "Product is not Active (already reserved by another order, or not sellable)",
      code: "PRODUCT_NOT_AVAILABLE",
    });
  }
}

/** Reserved → Active. Fires on "order marked Lost" (ORDERS_SPEC.md §7) and
 * is also the necessary counterpart of reserveProduct for removing a line
 * item or deleting a Draft order before completion — without this, a
 * product taken out of an order would stay Reserved forever with no order
 * left holding it. Best-effort like this file's other status-adjacent
 * guarded updates (deleteOrder, reserveOrder): 0 rows affected (already not
 * Reserved) is not treated as an error. */
export async function releaseProduct(productId: string): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ status: "Active" })
    .eq("id", productId)
    .eq("status", "Reserved");

  if (error) {
    throw new OrderRepositoryError("releaseProduct", error);
  }
}

/** Reserved → Sold, on order Completion (ORDERS_SPEC.md §7). Same
 * best-effort reasoning as releaseProduct. */
export async function markProductSold(productId: string): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ status: "Sold" })
    .eq("id", productId)
    .eq("status", "Reserved");

  if (error) {
    throw new OrderRepositoryError("markProductSold", error);
  }
}

// ---------------------------------------------------------------------------
// Write implementations — payments.
//
// Add-only, per ORDERS_UI.md §8: "No edit or delete action on a logged
// payment in V1... a future correction mechanism belongs to the V2
// Return/Refund discussion." No updatePayment/removePayment method exists
// here, and none is added — that would contradict the locked design, not
// fill a gap in it.
// ---------------------------------------------------------------------------

export async function addPayment(input: AddPaymentInput): Promise<OrderPayment> {
  const { data, error } = await supabase
    .from("payments")
    .insert(input)
    .select()
    .single();

  if (error) {
    console.error("Error adding payment:", error);
    throw new OrderRepositoryError("addPayment", error);
  }

  return data as OrderPayment;
}

// ---------------------------------------------------------------------------
// Write implementations — order_events. Append-only (ORDERS_DATABASE.md §8,
// §13): this is the only write function that ever inserts into
// order_events; nothing here updates or deletes a row.
// ---------------------------------------------------------------------------

export async function appendOrderEvent(event: Omit<OrderEvent, "id" | "event_timestamp">): Promise<OrderEvent> {
  const { data, error } = await supabase
    .from("order_events")
    .insert(event)
    .select()
    .single();

  if (error) {
    console.error("Error appending order event:", error);
    throw new OrderRepositoryError("appendOrderEvent", error);
  }

  return data as OrderEvent;
}

// ---------------------------------------------------------------------------
// Repository result models — composite read shapes a future implementation
// returns once payments/order_events exist (ORDERS_DATABASE.md §2-§4,
// ORDERS_UI.md §6 Order Detail needs order + items + payments + events
// together). Pure types only, no I/O.
// ---------------------------------------------------------------------------

export type OrderWithPayments = Order & { payments: OrderPayment[] };
export type OrderWithEvents = Order & { events: OrderEvent[] };

/** The eventual single Order Detail read shape (ORDERS_UI.md §6). */
export type FullOrderRecord = Order & {
  items: OrderItem[];
  payments: OrderPayment[];
  events: OrderEvent[];
};

// ---------------------------------------------------------------------------
// Repository mapping helpers — pure transforms, no I/O. Kept here (not in
// order.service.ts) since they operate on raw repository-shaped rows, not
// domain/business objects.
// ---------------------------------------------------------------------------

/** PostgREST's aggregate `count` join comes back as a single-element array. */
export function extractItemCount(row: OrderWithItemCount): number {
  return row.order_items?.[0]?.count ?? 0;
}

export function toFullOrderRecord(
  order: Order,
  items: OrderItem[],
  payments: OrderPayment[],
  events: OrderEvent[]
): FullOrderRecord {
  return { ...order, items, payments, events };
}

// ---------------------------------------------------------------------------
// Repository contract — signatures only, per ORDERS_IMPLEMENTATION_PLAN.md
// Tasks 3-4. Not implemented: the Development DB reset (Task 1) has not
// landed yet, so orders/order_items don't have the approved columns and
// payments/order_events don't exist at all. Implementing bodies against the
// current schema would reproduce the exact silent-failure pattern already
// seen twice on this project (query fails, error is swallowed, page renders
// empty). Once the schema lands, a concrete implementation (e.g. a
// `SupabaseOrderRepository`) satisfies `OrderRepository` in full; the three
// functions above already satisfy part of `OrderReadRepository` informally
// today, against the legacy schema, and will be reconciled into that
// implementation at that time.
// ---------------------------------------------------------------------------

export interface OrderReadRepository {
  findAllOrders(): Promise<OrderWithItemCount[]>;
  findOrderById(id: string): Promise<Order | null>;
  findOrderItemsByOrderId(orderId: string): Promise<OrderItem[]>;
  findPaymentsByOrderId(orderId: string): Promise<OrderPayment[]>;
  findOrderEventsByOrderId(orderId: string): Promise<OrderEvent[]>;
  findRevenueRecognizedOrders(start: string, end: string): Promise<Order[]>;
}

export interface OrderWriteRepository {
  createOrder(input: CreateOrderInput): Promise<Order>;
  /** Generic field update — see ORDER_WRITABLE_FIELDS for scope. Added this
   * increment, additive only (no existing signature changed). */
  updateOrder(id: string, changes: Partial<Order>): Promise<Order>;
  /** Non-admin path only: Draft + Unpaid. The admin path
   * (deleteOrderWithReconciliation below) is a separate method, not a
   * parameter on this one, since it performs a fundamentally different,
   * multi-table transactional operation (Product Owner Full Order Control
   * Decision, 2026-08-14). `adminOverride` here only widens which
   * order_status/payment_status this simple single-table delete matches —
   * see the implementation's doc comment. */
  deleteOrder(id: string, adminOverride?: boolean): Promise<void>;
  /** Admin Order Deletion pre-check/execution — see each implementation's
   * own doc comment. Never called for the non-admin path. */
  findCompensationStatusesForOrder(orderId: string): Promise<CompensationStatus[]>;
  deleteOrderWithReconciliation(staffId: string, orderId: string): Promise<void>;
  /** Dedicated, narrow status-transition methods — not a generic status
   * setter (per this increment's explicit instruction). */
  reserveOrder(orderId: string): Promise<Order>;
  cancelReservation(orderId: string): Promise<Order>;
  addOrderItem(input: AddOrderItemInput): Promise<OrderItem>;
  updateOrderItem(input: UpdateOrderItemInput): Promise<OrderItem>;
  removeOrderItem(orderId: string, id: string): Promise<void>;
  /** Product lifecycle (ORDERS_SPEC.md §7) — see the implementations above
   * for the exact guard/throw semantics of each. */
  reserveProduct(productId: string): Promise<void>;
  releaseProduct(productId: string): Promise<void>;
  markProductSold(productId: string): Promise<void>;
  addPayment(input: AddPaymentInput): Promise<OrderPayment>;
  markOrderLost(input: MarkOrderLostInput): Promise<Order>;
  completeOrder(
    orderId: string,
    purchaseRows: PurchaseSnapshotInput[],
    commissionRows: CommissionSnapshotInput[]
  ): Promise<Order>;
  reassignSalesOwner(input: ReassignSalesOwnerInput): Promise<Order>;
  appendOrderEvent(event: Omit<OrderEvent, "id" | "event_timestamp">): Promise<OrderEvent>;
  /** Persists rollup fields the service layer recomputes after every
   * order_items/payments mutation (ORDERS_DATABASE.md §4, "Derived"). */
  updateOrderRollups(orderId: string, rollups: OrderRollups): Promise<Order>;
}

/** The full contract a future concrete repository implementation must satisfy. */
export interface OrderRepository extends OrderReadRepository, OrderWriteRepository {}

/** Concrete Supabase-backed implementation, assembled now that every
 * OrderRepository member above has a body — the DI target for
 * createOrderService (order.service.ts). */
export const supabaseOrderRepository: OrderRepository = {
  findAllOrders,
  findOrderById,
  findOrderItemsByOrderId,
  findPaymentsByOrderId,
  findOrderEventsByOrderId,
  findRevenueRecognizedOrders,
  createOrder,
  updateOrder,
  deleteOrder,
  findCompensationStatusesForOrder,
  deleteOrderWithReconciliation,
  reserveOrder,
  cancelReservation,
  addOrderItem,
  updateOrderItem,
  removeOrderItem,
  reserveProduct,
  releaseProduct,
  markProductSold,
  addPayment,
  markOrderLost,
  completeOrder,
  reassignSalesOwner,
  appendOrderEvent,
  updateOrderRollups,
};
