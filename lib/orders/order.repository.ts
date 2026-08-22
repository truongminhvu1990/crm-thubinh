import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { logStatusChange } from "@/lib/auditLog.service";
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
  hasFinancialHistoryForOrder: "compensations",
  findVoidableFinancialRecordsForOrder: "compensations",
  deleteOrderWithReconciliation: "orders",
  cancelOrder: "orders",
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
/** RLS compatibility (2026082211): `client` is optional — authenticated API
 * routes pass their real request-scoped server client so this read runs
 * under the caller's own authenticated session, not the anon-defaulting
 * singleton (orders' anon-inclusive RLS policy was removed by
 * supabase/migrations/2026082211_orders_compensations_sales_commissions_rls_lockdown.sql,
 * leaving authenticated-only). Default preserved for any remaining caller
 * that doesn't pass one. */
export async function findAllOrders(staff?: ScopingStaff, client: SupabaseClient = supabase): Promise<OrderWithItemCount[]> {
  let query = client
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

/** RLS compatibility (2026082211) — same `client` reasoning as
 * findAllOrders above. */
export async function findOrderById(id: string, staff?: ScopingStaff, client: SupabaseClient = supabase): Promise<Order | null> {
  let query = client.from("orders").select(WITH_CUSTOMER).eq("id", id);

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

/** RLS compatibility (2026082211) — order_items carries the same
 * anon-closure as orders (same migration). */
export async function findOrderItemsByOrderId(orderId: string, client: SupabaseClient = supabase): Promise<OrderItem[]> {
  const { data, error } = await client
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
    .select(
      "*, receiving_account:receiving_accounts(id, currency, account_number, label, bank:master_data(value), owner:partners!receiving_accounts_owner_partner_id_fkey(name))"
    )
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
export async function findRevenueRecognizedOrders(start: string, end: string, client: SupabaseClient = supabase): Promise<Order[]> {
  const { data, error } = await client
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
async function generateOrderNumber(client: SupabaseClient = supabase): Promise<string> {
  const datePart = BusinessTime.todayString().replace(/-/g, "");
  const prefix = `OD-${datePart}-`;

  const { data, error } = await client
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

/** Business Time Migration, Wave 1: `order_date` defaults here (Vietnam
 * business date, via BusinessTime) rather than left to the
 * `orders.order_date` column's own DB default — the column default still
 * exists (also migrated to Vietnam time, see
 * 20260805_business_time_orders_write_path.sql, defense-in-depth for any
 * non-app insert path) but this is the one place that actually determines
 * the value for every order the app creates.
 *
 * Order Sale Date (Backdated Order support): `CreateOrderInput.order_date`
 * is now a real, optional request field — when the caller supplies it (a
 * user entering a backdated sale), it wins over today's date. `created_at`
 * is never touched by this — it stays the DB's own `now()` default,
 * recording the real system-creation instant regardless of `order_date`. */
export async function createOrder(input: CreateOrderInput, client: SupabaseClient = supabase): Promise<Order> {
  const order_number = await generateOrderNumber(client);
  const order_date = input.order_date || BusinessTime.todayString();

  const { data, error } = await client
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
export async function updateOrder(id: string, changes: Partial<Order>, client: SupabaseClient = supabase): Promise<Order> {
  const filteredData = pickOrderWritableFields(changes);

  const { data, error } = await client
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
export async function deleteOrder(id: string, adminOverride = false, client: SupabaseClient = supabase): Promise<void> {
  let query = client.from("orders").delete().eq("id", id);
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
export async function findCompensationStatusesForOrder(
  orderId: string,
  client: SupabaseClient = supabase
): Promise<CompensationStatus[]> {
  const { data, error } = await client.from("compensations").select("status").eq("order_id", orderId);

  if (error) {
    console.error("Error checking compensation statuses for order:", error);
    throw new OrderRepositoryError("findCompensationStatusesForOrder", error);
  }

  return (data || []).map((row) => row.status as CompensationStatus);
}

/**
 * D12 Order Cancellation (Product Owner Authorization, 2026-08-19, Decision
 * D/LOCKED) — "UI phải cảnh báo rõ nếu Order đã có compensation/commission".
 * Read-only, existence-only (never decides anything, same posture as
 * findCompensationStatusesForOrder). `sales_commissions.purchase_id` has no
 * real FK (deliberate, see 20260721_sales_commission_module.sql's header),
 * so it can't be reached via a single embedded PostgREST select — walked
 * manually: order_items -> customer_purchases -> sales_commissions.
 */
export async function hasFinancialHistoryForOrder(
  orderId: string,
  client: SupabaseClient = supabase
): Promise<{ hasCompensation: boolean; hasCommission: boolean }> {
  const { data: compensations, error: compensationError } = await client
    .from("compensations")
    .select("id")
    .eq("order_id", orderId)
    .limit(1);
  if (compensationError) {
    console.error("Error checking compensation existence for order:", compensationError);
    throw new OrderRepositoryError("hasFinancialHistoryForOrder", compensationError);
  }

  const { data: items, error: itemsError } = await client.from("order_items").select("id").eq("order_id", orderId);
  if (itemsError) {
    console.error("Error fetching order items for commission check:", itemsError);
    throw new OrderRepositoryError("hasFinancialHistoryForOrder", itemsError);
  }
  const itemIds = (items || []).map((i) => i.id as string);

  let hasCommission = false;
  if (itemIds.length > 0) {
    const { data: purchases, error: purchasesError } = await client
      .from("customer_purchases")
      .select("id")
      .in("order_item_id", itemIds);
    if (purchasesError) {
      console.error("Error fetching purchases for commission check:", purchasesError);
      throw new OrderRepositoryError("hasFinancialHistoryForOrder", purchasesError);
    }
    const purchaseIds = (purchases || []).map((p) => p.id as string);

    if (purchaseIds.length > 0) {
      const { data: commissions, error: commissionsError } = await client
        .from("sales_commissions")
        .select("id")
        .in("purchase_id", purchaseIds)
        .limit(1);
      if (commissionsError) {
        console.error("Error checking commission existence for order:", commissionsError);
        throw new OrderRepositoryError("hasFinancialHistoryForOrder", commissionsError);
      }
      hasCommission = (commissions || []).length > 0;
    }
  }

  return { hasCompensation: (compensations || []).length > 0, hasCommission };
}

/**
 * Compensation/Commission Void (Product Owner Authorization, 2026-08-20) —
 * a pre-cancel snapshot of every Compensation/Commission tied to this
 * order, restricted to the statuses the RPC (cancel_order_with_disposition,
 * 2026082002 migration) is about to Void: Compensation Draft/Pending/
 * Confirmed, Commission Pending/Approved. Called BEFORE cancelOrder() so
 * the caller (order.service.ts) knows each row's real *previous* status
 * for an accurate audit_log before/after entry - the RPC itself doesn't
 * return which rows it touched, only the updated `orders` row. Read-only,
 * same "never decides anything" posture as hasFinancialHistoryForOrder;
 * reuses its exact 3-hop walk for Commission (no real FK on purchase_id).
 */
export interface VoidableFinancialRecords {
  compensations: { id: string; status: string }[];
  commissions: { id: string; status: string }[];
}

export async function findVoidableFinancialRecordsForOrder(
  orderId: string,
  client: SupabaseClient = supabase
): Promise<VoidableFinancialRecords> {
  const { data: compensations, error: compensationError } = await client
    .from("compensations")
    .select("id, status")
    .eq("order_id", orderId)
    .in("status", ["Draft", "Pending", "Confirmed"]);
  if (compensationError) {
    console.error("Error fetching voidable compensations for order:", compensationError);
    throw new OrderRepositoryError("findVoidableFinancialRecordsForOrder", compensationError);
  }

  const { data: items, error: itemsError } = await client.from("order_items").select("id").eq("order_id", orderId);
  if (itemsError) {
    console.error("Error fetching order items for voidable commissions:", itemsError);
    throw new OrderRepositoryError("findVoidableFinancialRecordsForOrder", itemsError);
  }
  const itemIds = (items || []).map((i) => i.id as string);

  let commissions: { id: string; status: string }[] = [];
  if (itemIds.length > 0) {
    const { data: purchases, error: purchasesError } = await client
      .from("customer_purchases")
      .select("id")
      .in("order_item_id", itemIds);
    if (purchasesError) {
      console.error("Error fetching purchases for voidable commissions:", purchasesError);
      throw new OrderRepositoryError("findVoidableFinancialRecordsForOrder", purchasesError);
    }
    const purchaseIds = (purchases || []).map((p) => p.id as string);

    if (purchaseIds.length > 0) {
      const { data: commissionRows, error: commissionsError } = await client
        .from("sales_commissions")
        .select("id, status")
        .in("purchase_id", purchaseIds)
        .in("status", ["Pending", "Approved"]);
      if (commissionsError) {
        console.error("Error fetching voidable commissions for order:", commissionsError);
        throw new OrderRepositoryError("findVoidableFinancialRecordsForOrder", commissionsError);
      }
      commissions = (commissionRows || []) as { id: string; status: string }[];
    }
  }

  return { compensations: (compensations || []) as { id: string; status: string }[], commissions };
}

/**
 * D12 Order Cancellation (Product Owner Authorization, 2026-08-19) — the one
 * atomic write, mirroring completeOrder's own RPC-call shape (see
 * cancel_order_with_disposition's own doc comment,
 * supabase/migrations/2026081904_cancel_order_with_disposition.sql).
 * `audit` follows the same OrderAuditContext contract as reserveProduct/
 * releaseProduct/markProductSold (D5 completion) — the Order's own
 * Completed -> Cancelled audit_log entry and each Product's Sold -> ...
 * entry are both best-effort, logged after this RPC succeeds (see this
 * function's own comment on why that's not inside the transaction).
 */
export async function cancelOrder(
  orderId: string,
  dispositions: { order_item_id: string; disposition: string }[],
  audit?: OrderAuditContext
): Promise<Order> {
  // RLS compatibility (2026082211): reuse audit.client for the RPC call
  // itself, not only for the audit-log entry below — same reasoning as
  // reserveProduct/releaseProduct/markProductSold. Falls back to the anon
  // supabase default only when no audit context is given at all.
  const client = audit?.client ?? supabase;
  const { data, error } = await client.rpc("cancel_order_with_disposition", {
    p_order_id: orderId,
    p_dispositions: dispositions,
  });

  if (error) {
    console.error("Error cancelling order with disposition:", error);
    throw new OrderRepositoryError("cancelOrder", error);
  }

  // Only the Order's own transition is logged here. order_item_id ->
  // product_id isn't known at this layer without re-querying - the caller
  // (order.service.ts's cancelOrder) already has that mapping from the
  // items it validated dispositions against, so it logs each Product's own
  // Sold -> ... entry itself, right after this call succeeds.
  if (audit) {
    await logStatusChange(
      { tableName: "orders", recordId: orderId, before: "Completed", after: "Cancelled", actor: audit.actor },
      audit.client
    );
  } else {
    logMissingAuditContext("cancelOrder", orderId);
  }

  return data as Order;
}

/**
 * Admin Order Deletion's transactional reconciliation — see
 * supabase/migrations/2026081702_admin_order_delete_reconciliation.sql for
 * the exact deletion sequence and why each step is safe, and
 * supabase/migrations/2026081718_admin_order_delete_execute_privilege_fix.sql
 * for the database-level authorization this call now depends on. (Renamed
 * from 2026081717 during Financial RC integration — 2026081717 is used by
 * 2026081717_compensation_ledger_immutability_guard.sql; content unchanged.)
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
  commissionRows: CommissionSnapshotInput[],
  client: SupabaseClient = supabase
): Promise<Order> {
  const { data, error } = await client.rpc("complete_order_with_snapshots", {
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
export async function markOrderLost(input: MarkOrderLostInput, client: SupabaseClient = supabase): Promise<Order> {
  const { data, error } = await client
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
export async function reassignSalesOwner(
  input: ReassignSalesOwnerInput,
  client: SupabaseClient = supabase
): Promise<Order> {
  const { data, error } = await client
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
export async function updateOrderRollups(
  orderId: string,
  rollups: OrderRollups,
  client: SupabaseClient = supabase
): Promise<Order> {
  const { data, error } = await client
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

export async function addOrderItem(input: AddOrderItemInput, client: SupabaseClient = supabase): Promise<OrderItem> {
  const line_total = computeLineTotal(input.snapshot_sale_price, input.discount, input.quantity);

  const { data, error } = await client
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
export async function updateOrderItem(input: UpdateOrderItemInput, client: SupabaseClient = supabase): Promise<OrderItem> {
  const { data: current, error: fetchError } = await client
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

  const { data, error } = await client
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

export async function removeOrderItem(orderId: string, id: string, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.from("order_items").delete().eq("id", id).eq("order_id", orderId);

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

/**
 * D5 completion (Product Owner Authorization, 2026-08-19): the authenticated
 * client + actor a route handler resolved from the request's own session
 * cookies (lib/supabase/server.ts's createClient(), same mechanism
 * getCurrentStaffFromRequest already uses) — required so the audit_log
 * INSERT that follows a successful status transition runs under
 * `authenticated`, not this file's own anon-context `supabase` import.
 * Optional here (not on OrderRepository's own product-lifecycle methods) so
 * every existing caller/fake in order.service.test.ts stays valid; each
 * function below treats a missing context as a loud, visible failure of the
 * audit step specifically — never a silent skip, and never a fabricated
 * actor — while the status transition itself (the primary action) still
 * completes normally, matching this codebase's established log-don't-block
 * convention for side-effect writes.
 */
export interface OrderAuditContext {
  actor: string;
  client: SupabaseClient;
}

function logMissingAuditContext(fn: string, productId: string): void {
  console.error(
    `AUDIT LOG SKIPPED: ${fn} was called without an authenticated OrderAuditContext — this must never happen from a real, session-gated Orders route. Product status changed but was NOT recorded in audit_log.`,
    { productId }
  );
}

/** Available → Reserved (docs/02_PRODUCT_SPEC.md §7, LOCKED four-value
 * model). Guarded on `status = 'Available'` (BR-003, LOCKED, 2026-08-21 -
 * was `'Active'`), which is what makes this the actual concurrency check
 * ORDERS_SPEC.md §9/§17 requires: if another order already holds this
 * product (or it isn't sellable for any other reason), the guard matches
 * 0 rows and this throws instead of layering a second reservation on top.
 *
 * INV-012 (Orders/RLS reservation-blocker fix, 2026-08-22) — the actual
 * status transition now runs through the reserve_product() RPC (see
 * supabase/migrations/2026082206_reserve_product_rpc_authorization.sql)
 * using `audit.client` when a real OrderAuditContext is present, instead
 * of the anon-defaulting module-level `supabase` singleton: every real
 * caller already resolves and passes a real, cookie-authenticated
 * request-scoped client as `audit.client` (D5 completion) — this reuses
 * that exact same client for the write itself, not just the audit-log
 * entry that follows it, closing the anon-key REST bypass INV-012
 * diagnosed without introducing a second, parallel client parameter or
 * touching this function's public signature. Falls back to the anon
 * `supabase` default only when no audit context is given at all (the
 * documented "must never happen from a real route" edge case) — the RPC
 * itself then correctly rejects with an authorization error rather than
 * silently succeeding as anon. */
export async function reserveProduct(productId: string, audit?: OrderAuditContext): Promise<void> {
  const client = audit?.client ?? supabase;
  const { error } = await client.rpc("reserve_product", { p_product_id: productId });

  if (error) {
    if (error.code === "P0002") {
      throw new OrderRepositoryError("reserveProduct", {
        message: "Product is not Available (already reserved by another order, or not sellable)",
        code: "PRODUCT_NOT_AVAILABLE",
      });
    }
    throw new OrderRepositoryError("reserveProduct", error);
  }

  if (audit) {
    await logStatusChange(
      { tableName: "products", recordId: productId, before: "Available", after: "Reserved", actor: audit.actor },
      audit.client
    );
  } else {
    logMissingAuditContext("reserveProduct", productId);
  }
}

/** Reserved → Available (BR-003, LOCKED, 2026-08-21 - was `'Active'`). Fires on "order marked Lost" (ORDERS_SPEC.md §7) and
 * is also the necessary counterpart of reserveProduct for removing a line
 * item or deleting a Draft order before completion — without this, a
 * product taken out of an order would stay Reserved forever with no order
 * left holding it. Best-effort like this file's other status-adjacent
 * guarded updates (deleteOrder, reserveOrder): 0 rows affected (already not
 * Reserved) is not treated as an error.
 *
 * INV-012 — same release_product() RPC / audit.client reuse as
 * reserveProduct above (see
 * supabase/migrations/2026082207_release_product_rpc_authorization.sql).
 * The RPC itself always rejects a non-Reserved product (P0002); this
 * function's own historical non-strict contract is preserved entirely in
 * TypeScript — a P0002 is treated as the same silent no-op it always was,
 * never re-thrown, never logged as a transition that didn't happen. No
 * `strict` parameter exists or is introduced. */
export async function releaseProduct(productId: string, audit?: OrderAuditContext): Promise<void> {
  const client = audit?.client ?? supabase;
  const { error } = await client.rpc("release_product", { p_product_id: productId });

  if (error) {
    if (error.code === "P0002") {
      // Best-effort update (0 rows affected — already not Reserved — is not
      // an error, per this function's own existing contract above): only
      // log a transition that actually happened.
      return;
    }
    throw new OrderRepositoryError("releaseProduct", error);
  }

  if (audit) {
    await logStatusChange(
      { tableName: "products", recordId: productId, before: "Reserved", after: "Available", actor: audit.actor },
      audit.client
    );
  } else {
    logMissingAuditContext("releaseProduct", productId);
  }
}

/** Reserved → Sold, on order Completion (ORDERS_SPEC.md §7). Same
 * best-effort reasoning as releaseProduct.
 *
 * INV-012 — deliberately NOT converted to an RPC (no sell_product()
 * function exists or is introduced here): only the client this direct
 * `.update()` runs through changes, reusing `audit.client` exactly like
 * reserveProduct/releaseProduct above. Zero-rows-affected still returns
 * silently (no strict mode, no throw) — byte-for-byte the same contract
 * as before. */
export async function markProductSold(productId: string, audit?: OrderAuditContext): Promise<void> {
  const client = audit?.client ?? supabase;
  const { data, error } = await client
    .from("products")
    .update({ status: "Sold" })
    .eq("id", productId)
    .eq("status", "Reserved")
    .select("id");

  if (error) {
    throw new OrderRepositoryError("markProductSold", error);
  }

  if (!data || data.length === 0) return;

  if (audit) {
    await logStatusChange(
      { tableName: "products", recordId: productId, before: "Reserved", after: "Sold", actor: audit.actor },
      audit.client
    );
  } else {
    logMissingAuditContext("markProductSold", productId);
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

/** RLS compatibility (2026082211_orders_compensations_sales_commissions_rls_lockdown.sql)
 * — every member below whose table (orders/order_items/compensations/
 * sales_commissions/products) had its anon-inclusive RLS policy removed now
 * accepts an optional trailing `client`/`audit` parameter, reusing whichever
 * pattern that function already had (OrderAuditContext where D5 audit
 * logging already threads a real client through, a plain `client` parameter
 * everywhere else). All optional, all defaulting to the anon singleton in
 * the concrete implementation — this interface only exists so
 * order.service.ts's orchestration can actually pass one through. No
 * method's business behavior, argument order, or return type changes. */
export interface OrderReadRepository {
  findAllOrders(staff?: ScopingStaff, client?: SupabaseClient): Promise<OrderWithItemCount[]>;
  findOrderById(id: string, staff?: ScopingStaff, client?: SupabaseClient): Promise<Order | null>;
  findOrderItemsByOrderId(orderId: string, client?: SupabaseClient): Promise<OrderItem[]>;
  findPaymentsByOrderId(orderId: string): Promise<OrderPayment[]>;
  findOrderEventsByOrderId(orderId: string): Promise<OrderEvent[]>;
  findRevenueRecognizedOrders(start: string, end: string, client?: SupabaseClient): Promise<Order[]>;
}

export interface OrderWriteRepository {
  createOrder(input: CreateOrderInput, client?: SupabaseClient): Promise<Order>;
  /** Generic field update — see ORDER_WRITABLE_FIELDS for scope. Added this
   * increment, additive only (no existing signature changed). */
  updateOrder(id: string, changes: Partial<Order>, client?: SupabaseClient): Promise<Order>;
  /** Non-admin path only: Draft + Unpaid. The admin path
   * (deleteOrderWithReconciliation below) is a separate method, not a
   * parameter on this one, since it performs a fundamentally different,
   * multi-table transactional operation (Product Owner Full Order Control
   * Decision, 2026-08-14). `adminOverride` here only widens which
   * order_status/payment_status this simple single-table delete matches —
   * see the implementation's doc comment. */
  deleteOrder(id: string, adminOverride?: boolean, client?: SupabaseClient): Promise<void>;
  /** Admin Order Deletion pre-check/execution — see each implementation's
   * own doc comment. Never called for the non-admin path. */
  findCompensationStatusesForOrder(orderId: string, client?: SupabaseClient): Promise<CompensationStatus[]>;
  /** D12 Order Cancellation, Decision D (LOCKED) — existence-only read for
   * the UI's pre-confirm warning. See implementation's own doc comment. */
  hasFinancialHistoryForOrder(
    orderId: string,
    client?: SupabaseClient
  ): Promise<{ hasCompensation: boolean; hasCommission: boolean }>;
  /** Compensation/Commission Void (Product Owner Authorization, 2026-08-20)
   * — pre-cancel snapshot, see implementation's own doc comment. */
  findVoidableFinancialRecordsForOrder(orderId: string, client?: SupabaseClient): Promise<VoidableFinancialRecords>;
  deleteOrderWithReconciliation(staffId: string, orderId: string): Promise<void>;
  /** Dedicated, narrow status-transition methods — not a generic status
   * setter (per this increment's explicit instruction). No live API caller
   * today (confirmed by direct route trace) — left as anon-defaulting only,
   * not extended, since there is nothing to thread a client through from. */
  reserveOrder(orderId: string): Promise<Order>;
  cancelReservation(orderId: string): Promise<Order>;
  addOrderItem(input: AddOrderItemInput, client?: SupabaseClient): Promise<OrderItem>;
  updateOrderItem(input: UpdateOrderItemInput, client?: SupabaseClient): Promise<OrderItem>;
  removeOrderItem(orderId: string, id: string, client?: SupabaseClient): Promise<void>;
  /** Product lifecycle (ORDERS_SPEC.md §7) — see the implementations above
   * for the exact guard/throw semantics of each. `audit`: see
   * OrderAuditContext's own doc comment. */
  reserveProduct(productId: string, audit?: OrderAuditContext): Promise<void>;
  releaseProduct(productId: string, audit?: OrderAuditContext): Promise<void>;
  markProductSold(productId: string, audit?: OrderAuditContext): Promise<void>;
  addPayment(input: AddPaymentInput): Promise<OrderPayment>;
  markOrderLost(input: MarkOrderLostInput, client?: SupabaseClient): Promise<Order>;
  completeOrder(
    orderId: string,
    purchaseRows: PurchaseSnapshotInput[],
    commissionRows: CommissionSnapshotInput[],
    client?: SupabaseClient
  ): Promise<Order>;
  reassignSalesOwner(input: ReassignSalesOwnerInput, client?: SupabaseClient): Promise<Order>;
  /** D12 Order Cancellation — see cancel_order_with_disposition's own doc
   * comment (supabase/migrations/2026081904_cancel_order_with_disposition.sql). */
  cancelOrder(
    orderId: string,
    dispositions: { order_item_id: string; disposition: string }[],
    audit?: OrderAuditContext
  ): Promise<Order>;
  appendOrderEvent(event: Omit<OrderEvent, "id" | "event_timestamp">): Promise<OrderEvent>;
  /** Persists rollup fields the service layer recomputes after every
   * order_items/payments mutation (ORDERS_DATABASE.md §4, "Derived"). */
  updateOrderRollups(orderId: string, rollups: OrderRollups, client?: SupabaseClient): Promise<Order>;
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
  hasFinancialHistoryForOrder,
  findVoidableFinancialRecordsForOrder,
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
  cancelOrder,
  reassignSalesOwner,
  appendOrderEvent,
  updateOrderRollups,
};
