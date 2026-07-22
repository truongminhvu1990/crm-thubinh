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
 */
async function generateOrderNumber(): Promise<string> {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const prefix = `OD-${datePart}-`;

  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .like("order_number", `${prefix}%`);

  if (error) {
    // TEMPORARY DEBUG INSTRUMENTATION — remove after investigation.
    console.error("DEBUG generateOrderNumber raw error", {
      typeofError: typeof error,
      isErrorInstance: error instanceof Error,
      constructorName: (error as { constructor?: { name?: string } })?.constructor?.name,
      keys: error && typeof error === "object" ? Object.keys(error) : null,
      jsonStringify: (() => {
        try {
          return JSON.stringify(error);
        } catch {
          return "<JSON.stringify threw>";
        }
      })(),
      stringForm: String(error),
    });
    throw new OrderRepositoryError("generateOrderNumber", error);
  }

  const sequence = (count ?? 0) + 1;
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

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const order_number = await generateOrderNumber();

  const { data, error } = await supabase
    .from("orders")
    .insert({ ...input, order_number })
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
 * Deletes an order — restricted to `order_status = 'Draft'` directly in the
 * query's WHERE clause, matching ORDERS_DATABASE.md §7's framing of order
 * deletion as "a data-integrity backstop, not a supported workflow": nothing
 * (reservation, payment, completion) has happened yet on a Draft order, so
 * this is the one status where a hard delete carries no data-integrity risk.
 * No UI exposes this — repository capability only, per this increment's
 * scope. Silently deletes 0 rows (no error) if the order isn't Draft or
 * doesn't exist, matching this codebase's existing deleteCustomer/
 * deleteProduct behavior of returning the (possibly null) Supabase error
 * rather than asserting a row was actually affected.
 */
export async function deleteOrder(id: string): Promise<void> {
  const { error } = await supabase.from("orders").delete().eq("id", id).eq("order_status", "Draft");

  if (error) {
    console.error("Error deleting order:", error);
    throw new OrderRepositoryError("deleteOrder", error);
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
export async function completeOrder(orderId: string): Promise<Order> {
  const { data, error } = await supabase
    .from("orders")
    .update({ order_status: "Completed" })
    .eq("id", orderId)
    .in("order_status", ["Draft", "Reserved"])
    .select()
    .single();

  if (error) {
    console.error("Error completing order:", error);
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
  /** Draft-only, per this increment's scope — see the implementation's
   * doc comment for why this is safe as a repository-level capability
   * without a corresponding UI action. */
  deleteOrder(id: string): Promise<void>;
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
  completeOrder(orderId: string): Promise<Order>;
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
