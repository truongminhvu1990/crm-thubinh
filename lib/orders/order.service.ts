import * as orderRepository from "./order.repository";
import { CommissionSnapshotInput, OrderRepository, PurchaseSnapshotInput, ScopingStaff } from "./order.repository";
import { getStaffByName } from "@/lib/staff.service";
import { getActiveCommissionRules } from "@/lib/commission/commission.repository";
import { calculateCommissionAmount, findMatchingRule } from "@/lib/commission/commission.service";
import {
  AddOrderItemInput,
  AddPaymentInput,
  CreateOrderInput,
  MarkOrderLostInput,
  Order,
  OrderEvent,
  OrderItem,
  OrderPayment,
  OrderStatus,
  PaymentStatus,
  ReassignSalesOwnerInput,
  UpdateOrderInput,
  UpdateOrderItemInput,
} from "@/types/order";
import {
  calculateAmountPaid,
  calculateDiscountTotal,
  calculateRemainingBalance,
  calculateSubtotal,
  calculateTotalAmount,
  canAddPayment,
  canEditOrderItems,
  canReassignSalesOwner,
  derivePaymentStatus,
  deriveOrderTimelineStages,
  isOrderTimelineInterrupted,
  isValidOrderStatusTransition,
  OrderTimelineStage,
  validateOrderCompletion,
  validateOrderDeletion,
  validateMarkOrderLostTransition,
} from "./order.rules";
import {
  validateAddOrderItemInput,
  validateCreateOrderInput,
  validateMarkOrderLostInput,
  validatePaymentAmount,
  validateReceivingAccountSelection,
  validateReassignSalesOwnerInput,
} from "./order.validation";
import { getReceivingAccountById } from "@/lib/receivingAccount.service";

export interface OrderListItem extends Order {
  item_count: number;
}

/** List-page read: every order with its customer joined and item count
 * resolved, newest first. Search/filter/sort stay client-side in the page
 * component, same convention as Customer/Product List.
 *
 * Data Scope Rollout (Sprint v4.1), Package 2 - `staff` is optional,
 * threaded straight through to `findAllOrders`, preserving this function's
 * existing contract for any caller that doesn't pass it. */
export async function getOrderList(staff?: ScopingStaff): Promise<OrderListItem[]> {
  const rows = await orderRepository.findAllOrders(staff);

  return rows.map((row) => ({
    ...row,
    item_count: orderRepository.extractItemCount(row),
  }));
}

export interface OrderDetail {
  order: Order;
  items: OrderItem[];
  payments: OrderPayment[];
  events: OrderEvent[];
}

/** Order Detail read (ORDERS_UI.md §6) — order header, line items, payments,
 * and the detailed Order Event Timeline, fetched in parallel (same pattern
 * already used by recomputeAndPersistRollups). Additive to the previous
 * {order, items} shape — existing callers destructuring just those two
 * fields are unaffected. `staff` (optional, Package 2) scopes the order
 * header lookup only - items/payments/events belong to whatever order was
 * already found, so scoping them again would be redundant, not additional
 * protection. */
export async function getOrderDetail(id: string, staff?: ScopingStaff): Promise<OrderDetail | null> {
  const order = await orderRepository.findOrderById(id, staff);
  if (!order) return null;

  const [items, payments, events] = await Promise.all([
    orderRepository.findOrderItemsByOrderId(id),
    orderRepository.findPaymentsByOrderId(id),
    orderRepository.findOrderEventsByOrderId(id),
  ]);

  return { order, items, payments, events };
}

/** Order Event Timeline read (ORDERS_UI.md §9.2) — newest first, per
 * findOrderEventsByOrderId's own ordering. Kept as its own standalone read
 * too (not just embedded in getOrderDetail) for callers that only need the
 * event log. */
export async function getOrderEvents(orderId: string): Promise<OrderEvent[]> {
  return orderRepository.findOrderEventsByOrderId(orderId);
}

/** ORDERS_UI.md §9.1 — the simplified Created→Reserved→Payment→Completed
 * progress bar. Product Owner-approved V1 scope: current order state only,
 * no order_events reconstruction (see order.rules.ts's deriveOrderTimelineStages). */
export interface OrderTimeline {
  stages: OrderTimelineStage[];
  isInterrupted: boolean;
}

export async function getOrderTimeline(orderId: string): Promise<OrderTimeline | null> {
  const order = await orderRepository.findOrderById(orderId);
  if (!order) return null;

  return {
    stages: deriveOrderTimelineStages(order.order_status, order.payment_status),
    isInterrupted: isOrderTimelineInterrupted(order.order_status),
  };
}

/** ORDERS_UI.md §3 Quick View — a condensed, read-only summary: everything
 * the popup shows, without the full line-items/payments/events detail. */
export interface OrderSummary {
  order_id: string;
  order_number: string;
  customer_name?: string;
  sales_owner: string;
  order_date: string;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  item_count: number;
  total_amount: number;
  remaining_balance: number;
  lost_reason?: string | null;
}

export async function getOrderSummary(orderId: string): Promise<OrderSummary | null> {
  const order = await orderRepository.findOrderById(orderId);
  if (!order) return null;

  const [items, payments] = await Promise.all([
    orderRepository.findOrderItemsByOrderId(orderId),
    orderRepository.findPaymentsByOrderId(orderId),
  ]);

  return {
    order_id: order.id!,
    order_number: order.order_number,
    customer_name: order.customer?.full_name,
    sales_owner: order.sales_owner,
    order_date: order.order_date,
    order_status: order.order_status,
    payment_status: order.payment_status,
    item_count: items.length,
    total_amount: order.total_amount,
    remaining_balance: calculateRemainingBalance(order.total_amount, payments),
    lost_reason: order.lost_reason,
  };
}

/** ORDERS_UI.md §2 — Customer Detail's Purchase History: one row per Order
 * Item (not grouped by Order), sorted newest first. No dedicated
 * "orders by customer" repository method exists, so this filters
 * findAllOrders' results client-side, matching the same client-side-filter
 * convention getOrderList's own comment already documents for Customer/
 * Product List. */
export interface CustomerOrderHistoryRow {
  order_id: string;
  order_number: string;
  product_id: string;
  product_name?: string;
  product_code?: string;
  snapshot_sale_price: number;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  order_date: string;
}

export async function getCustomerOrderHistory(customerId: string): Promise<CustomerOrderHistoryRow[]> {
  const orders = await orderRepository.findAllOrders();
  const customerOrders = orders.filter((order) => order.customer_id === customerId);

  const rows: CustomerOrderHistoryRow[] = [];
  for (const order of customerOrders) {
    const items = await orderRepository.findOrderItemsByOrderId(order.id!);
    for (const item of items) {
      rows.push({
        order_id: order.id!,
        order_number: order.order_number,
        product_id: item.product_id,
        product_name: item.product?.product_name,
        product_code: item.product?.product_code,
        snapshot_sale_price: item.snapshot_sale_price,
        order_status: order.order_status,
        payment_status: order.payment_status,
        order_date: order.order_date,
      });
    }
  }

  return rows.sort((a, b) => (a.order_date > b.order_date ? -1 : a.order_date < b.order_date ? 1 : 0));
}

/** ORDERS_SPEC.md §5 Revenue Recognition: Completed AND Paid only — the
 * boundary §17 calls "the single biggest risk in this spec overall" (a
 * Completed-but-Partially-Paid order must never count). Sums total_amount
 * over orders whose order_date falls in [start, end). This is the current
 * approved sales source for Dashboard revenue — Reports' own revenue tables
 * are untouched by this function. */
export async function getOrdersRevenueForRange(start: string, end: string): Promise<number> {
  const orders = await orderRepository.findRevenueRecognizedOrders(start, end);
  return orders.reduce((sum, order) => sum + order.total_amount, 0);
}

// ---------------------------------------------------------------------------
// Write orchestration — per ORDERS_IMPLEMENTATION_PLAN.md Task 4.
//
// Each method follows DTO -> Validation (order.validation.ts) -> Business
// Rules (order.rules.ts) -> Repository (injected OrderRepository), reusing
// the validation/rules functions rather than restating any check. No
// Supabase, no SQL, no fake/mock repository: `createOrderService` takes a
// real OrderRepository as a parameter (dependency injection through the
// interface only) — nothing here can run until a concrete implementation of
// that interface exists, which itself waits on the DB reset
// (ORDERS_IMPLEMENTATION_PLAN.md Task 1).
//
// Order Event logging (`appendOrderEvent`) is now wired into every workflow
// below via a new `actor` parameter added to each method — the previously
// flagged gap (every write DTO lacked an actor/staff-identity field) is
// resolved the minimal way: `actor` is a plain parameter, not baked into the
// existing DTOs, so no DTO shape changed. Only the 8 event types
// ORDERS_SPEC.md §8 actually names are used (Order Created, Product Added,
// Product Removed, Price Changed, Payment Added, Status Changed, Sales
// Owner Reassigned, Marked Lost) — `updateOrder` (generic note/date edit)
// and `deleteOrder` log nothing, since neither has a corresponding entry in
// that fixed picklist and inventing a 9th type would be a business-rule
// redesign, not a gap-fill.
// ---------------------------------------------------------------------------

export interface OrderWriteService {
  createOrder(input: CreateOrderInput, actor: string): Promise<Order>;
  updateOrder(input: UpdateOrderInput, actor: string): Promise<Order>;
  /**
   * `adminOverride` (Product Owner Full Order Control Decision, 2026-08-14) —
   * Owner only, resolved and passed by the caller (the API route), never
   * inferred here. `staffId` is required whenever `adminOverride` is true —
   * it is the server-verified actor's staff id, passed through to
   * `delete_order_with_reconciliation`'s own `p_staff_id` argument so the
   * database can independently re-verify the Owner role itself (2026081717
   * migration) rather than trusting this layer alone.
   */
  deleteOrder(orderId: string, actor: string, adminOverride?: boolean, staffId?: string): Promise<void>;
  reserveOrder(orderId: string, actor: string): Promise<Order>;
  cancelReservation(orderId: string, actor: string): Promise<Order>;
  addProductToOrder(input: AddOrderItemInput, actor: string): Promise<OrderItem>;
  updateOrderItem(input: UpdateOrderItemInput, actor: string): Promise<OrderItem>;
  removeProductFromOrder(orderId: string, orderItemId: string, actor: string): Promise<void>;
  addPayment(input: AddPaymentInput, actor: string): Promise<OrderPayment>;
  /** Standalone entry point for the same rollup recomputation addPayment
   * already triggers internally — exposed for reconciliation/repair use, not
   * a new calculation (reuses the existing private helper as-is). No event
   * logged: recalculation isn't one of ORDERS_SPEC.md §8's 8 event types. */
  recalculatePaymentStatus(orderId: string): Promise<Order>;
  markOrderLost(input: MarkOrderLostInput, actor: string): Promise<Order>;
  completeOrder(orderId: string, actor: string): Promise<Order>;
  reassignSalesOwner(input: ReassignSalesOwnerInput, actor: string): Promise<Order>;
}

export class OrderNotFoundError extends Error {}

export class OrderValidationError extends Error {
  constructor(public readonly fieldErrors: Record<string, string>) {
    super(Object.values(fieldErrors).join("; "));
    this.name = "OrderValidationError";
  }
}

export class OrderRuleViolationError extends Error {}

/**
 * Admin Order Deletion pre-check failure (Product Owner Full Order Control
 * Decision, 2026-08-14). Distinct from OrderRuleViolationError so
 * app/api/orders/_errors.ts can give it a specific, named 409 message
 * instead of a generic business-rule string — represents a known,
 * pre-computed business condition, never a raw database failure (that's
 * OrderDeleteRevenueConflictError, order.repository.ts, for the one case
 * that genuinely can't be pre-checked in TypeScript — see its own doc
 * comment). The same condition is independently re-enforced inside
 * delete_order_with_reconciliation itself (2026081717 migration).
 */
export class OrderDeleteCompensationConflictError extends Error {}

async function requireOrder(repository: OrderRepository, orderId: string): Promise<Order> {
  const order = await repository.findOrderById(orderId);
  if (!order) {
    throw new OrderNotFoundError(`Order ${orderId} not found`);
  }
  return order;
}

function throwIfErrors(errors: Record<string, string>): void {
  if (Object.keys(errors).length > 0) {
    throw new OrderValidationError(errors);
  }
}

function assertOrderEditable(order: Order): void {
  if (!canEditOrderItems(order.order_status)) {
    throw new OrderRuleViolationError("Đơn hàng không ở trạng thái có thể chỉnh sửa");
  }
}

/** Recomputes and persists subtotal/discount total/total amount/payment
 * status after any order_items or payments mutation (ORDERS_DATABASE.md §4). */
async function recomputeAndPersistRollups(repository: OrderRepository, orderId: string): Promise<Order> {
  const [items, payments] = await Promise.all([
    repository.findOrderItemsByOrderId(orderId),
    repository.findPaymentsByOrderId(orderId),
  ]);

  const subtotal = calculateSubtotal(items);
  const discount_total = calculateDiscountTotal(items);
  const total_amount = calculateTotalAmount(subtotal, discount_total);
  const payment_status = derivePaymentStatus(total_amount, calculateAmountPaid(payments));

  return repository.updateOrderRollups(orderId, { subtotal, discount_total, total_amount, payment_status });
}

/** Dependency injection through the repository interface only — no concrete
 * (Supabase or otherwise) repository is referenced here. */
export function createOrderService(repository: OrderRepository): OrderWriteService {
  return {
    async createOrder(input, actor) {
      throwIfErrors(validateCreateOrderInput(input));
      const order = await repository.createOrder(input);
      await repository.appendOrderEvent({
        order_id: order.id!,
        event_type: "Order Created",
        event_detail: "Đơn hàng được tạo",
        actor,
      });
      return order;
    },

    async updateOrder(input) {
      await requireOrder(repository, input.order_id);
      const { order_id, ...changes } = input;
      return repository.updateOrder(order_id, changes);
    },

    async deleteOrder(orderId, _actor, adminOverride = false, staffId) {
      const order = await requireOrder(repository, orderId);

      if (!adminOverride) {
        const deletionError = validateOrderDeletion(order.order_status, order.payment_status);
        if (deletionError) {
          throw new OrderRuleViolationError(deletionError);
        }

        // Draft orders can already hold Reserved items (addProductToOrder
        // reserves on add regardless of order status, per ORDERS_SPEC.md
        // §7) — order_items cascade-deletes with the order, so their
        // products must be released first or they'd be stranded Reserved
        // with no order left holding them.
        const items = await repository.findOrderItemsByOrderId(orderId);
        await repository.deleteOrder(orderId, false);
        await Promise.all(items.map((item) => repository.releaseProduct(item.product_id)));
        return;
      }

      // Admin/Owner Full Order Control (Product Owner Decision, 2026-08-14):
      // no lifecycle-status/payment gate remains for the admin path. The one
      // pre-check that still stands is a genuine LOCKED-financial-history
      // protection: Compensation Confirmed/Handed Off — "a Confirmed/Handed
      // Off record is never deleted" (Traceability principle). Since Handed
      // Off is a hard prerequisite for a Compensation ever entering a
      // settlement_items row, refusing every Handed-Off compensation here
      // transitively refuses every settlement-bound one too. This same
      // condition is re-checked, independently, inside
      // delete_order_with_reconciliation itself (2026081717 migration) —
      // this call is defense in depth, not the only enforcement point.
      const compensationStatuses = await repository.findCompensationStatusesForOrder(orderId);
      if (compensationStatuses.some((s) => s === "Confirmed" || s === "Handed Off")) {
        throw new OrderDeleteCompensationConflictError(
          "Đơn hàng có hoa hồng đối tác đã Xác nhận hoặc Bàn giao — không thể xóa vì sẽ làm mất lịch sử tài chính đã ghi nhận."
        );
      }

      if (!staffId) {
        throw new OrderRuleViolationError("Không xác định được nhân viên thực hiện thao tác xóa");
      }

      await repository.deleteOrderWithReconciliation(staffId, orderId);
    },

    async reserveOrder(orderId, actor) {
      const order = await requireOrder(repository, orderId);

      if (!isValidOrderStatusTransition(order.order_status, "Reserved")) {
        throw new OrderRuleViolationError("Đơn hàng không ở trạng thái có thể chuyển sang Đã giữ hàng");
      }

      const updated = await repository.reserveOrder(orderId);
      await repository.appendOrderEvent({
        order_id: orderId,
        event_type: "Status Changed",
        event_detail: `Trạng thái thay đổi: ${order.order_status} → Reserved`,
        actor,
      });
      return updated;
    },

    async cancelReservation(orderId, actor) {
      const order = await requireOrder(repository, orderId);

      if (!isValidOrderStatusTransition(order.order_status, "Draft")) {
        throw new OrderRuleViolationError("Đơn hàng không ở trạng thái có thể hủy giữ hàng");
      }

      const updated = await repository.cancelReservation(orderId);
      await repository.appendOrderEvent({
        order_id: orderId,
        event_type: "Status Changed",
        event_detail: `Trạng thái thay đổi: ${order.order_status} → Draft`,
        actor,
      });
      return updated;
    },

    async addProductToOrder(input, actor) {
      const order = await requireOrder(repository, input.order_id);
      assertOrderEditable(order);
      throwIfErrors(validateAddOrderItemInput(input));

      // ORDERS_SPEC.md §9/§17: reserving is what makes "one open order item
      // per product" a real guarantee, not just documentation — see
      // reserveProduct's WHERE-guard. Must happen before the item is
      // inserted, so a product already held elsewhere never gets a second
      // order_item created against it.
      try {
        await repository.reserveProduct(input.product_id);
      } catch {
        throw new OrderRuleViolationError(
          "Sản phẩm đã được giữ bởi đơn hàng khác hoặc không còn ở trạng thái có sẵn"
        );
      }

      let item: OrderItem;
      try {
        item = await repository.addOrderItem(input);
      } catch (err) {
        // Best-effort rollback of the reservation above if the item insert
        // itself then fails, so the product isn't left stranded Reserved
        // with no order actually holding it.
        await repository.releaseProduct(input.product_id).catch(() => {});
        throw err;
      }

      await recomputeAndPersistRollups(repository, input.order_id);
      await repository.appendOrderEvent({
        order_id: input.order_id,
        event_type: "Product Added",
        event_detail: `Đã thêm sản phẩm (mã: ${input.product_id})`,
        actor,
      });
      return item;
    },

    async updateOrderItem(input, actor) {
      const order = await requireOrder(repository, input.order_id);
      assertOrderEditable(order);

      const items = await repository.findOrderItemsByOrderId(input.order_id);
      const current = items.find((item) => item.id === input.id);
      if (!current) {
        throw new OrderNotFoundError(`Order item ${input.id} not found`);
      }

      // Merge the partial update onto current state so the existing
      // full-item validator can be reused as-is, with nothing restated.
      const merged: AddOrderItemInput = {
        order_id: input.order_id,
        product_id: current.product_id,
        snapshot_sale_price: input.snapshot_sale_price ?? current.snapshot_sale_price,
        discount: input.discount ?? current.discount,
        quantity: input.quantity ?? current.quantity,
        is_gift: input.is_gift ?? current.is_gift,
        gift_recipient_name: input.gift_recipient_name ?? current.gift_recipient_name,
        gift_note: input.gift_note ?? current.gift_note,
        packaging_option: input.packaging_option ?? current.packaging_option,
      };
      throwIfErrors(validateAddOrderItemInput(merged));

      const item = await repository.updateOrderItem(input);
      await recomputeAndPersistRollups(repository, input.order_id);
      await repository.appendOrderEvent({
        order_id: input.order_id,
        event_type: "Price Changed",
        event_detail: `Đã cập nhật sản phẩm trong đơn (mã dòng: ${input.id})`,
        actor,
      });
      return item;
    },

    async removeProductFromOrder(orderId, orderItemId, actor) {
      const order = await requireOrder(repository, orderId);
      assertOrderEditable(order);

      // Necessary counterpart of addProductToOrder's reserveProduct call:
      // taking a line item out of an open order must release the product
      // back to Active, or it would stay Reserved forever with no order
      // holding it (ORDERS_SPEC.md §7 only names Completed/Lost as
      // transition triggers, but removal is the same "no longer held by
      // this order" case in substance).
      const items = await repository.findOrderItemsByOrderId(orderId);
      const removedItem = items.find((item) => item.id === orderItemId);

      await repository.removeOrderItem(orderId, orderItemId);
      if (removedItem) {
        await repository.releaseProduct(removedItem.product_id);
      }
      await recomputeAndPersistRollups(repository, orderId);
      await repository.appendOrderEvent({
        order_id: orderId,
        event_type: "Product Removed",
        event_detail: `Đã xóa sản phẩm khỏi đơn (mã dòng: ${orderItemId})`,
        actor,
      });
    },

    async addPayment(input, actor) {
      const order = await requireOrder(repository, input.order_id);
      if (!canAddPayment(order.order_status, order.payment_status)) {
        throw new OrderRuleViolationError("Đơn hàng không thể nhận thêm thanh toán ở trạng thái hiện tại");
      }

      const amountError = validatePaymentAmount(input);
      if (amountError) {
        throw new OrderValidationError({ amount: amountError });
      }

      const receivingAccountError = validateReceivingAccountSelection(input);
      if (receivingAccountError) {
        throw new OrderValidationError({ receiving_account_id: receivingAccountError });
      }
      if (input.receiving_account_id) {
        const account = await getReceivingAccountById(input.receiving_account_id);
        if (!account || !account.is_active) {
          throw new OrderRuleViolationError("Tài khoản nhận tiền không tồn tại hoặc đã ngừng hoạt động");
        }
      }

      const payment = await repository.addPayment(input);
      await recomputeAndPersistRollups(repository, input.order_id);
      await repository.appendOrderEvent({
        order_id: input.order_id,
        event_type: "Payment Added",
        event_detail: `Thanh toán ${input.amount.toLocaleString("vi-VN")}₫ qua ${input.payment_method}`,
        actor,
      });
      return payment;
    },

    async recalculatePaymentStatus(orderId) {
      await requireOrder(repository, orderId);
      return recomputeAndPersistRollups(repository, orderId);
    },

    async markOrderLost(input, actor) {
      const order = await requireOrder(repository, input.order_id);

      const transitionError = validateMarkOrderLostTransition(order.order_status);
      if (transitionError) {
        throw new OrderRuleViolationError(transitionError);
      }

      const reasonError = validateMarkOrderLostInput(input);
      if (reasonError) {
        throw new OrderValidationError({ lost_reason: reasonError });
      }

      // ORDERS_SPEC.md §7: "Reserved --(order marked Lost)--> Available" —
      // every reserved line's product goes back to Active.
      const items = await repository.findOrderItemsByOrderId(input.order_id);
      const updated = await repository.markOrderLost(input);
      await Promise.all(items.map((item) => repository.releaseProduct(item.product_id)));
      await repository.appendOrderEvent({
        order_id: input.order_id,
        event_type: "Marked Lost",
        event_detail: `Đánh dấu Lost — Lý do: ${input.lost_reason}`,
        actor,
      });
      return updated;
    },

    async completeOrder(orderId, actor) {
      const order = await requireOrder(repository, orderId);
      const items = await repository.findOrderItemsByOrderId(orderId);

      const completionError = validateOrderCompletion(order.order_status, items.length);
      if (completionError) {
        throw new OrderRuleViolationError(completionError);
      }

      // Orders -> Sales Snapshot Integration: one customer_purchases row +
      // one sales_commissions row per order_item, committed atomically
      // with the status transition below (complete_order_with_snapshots
      // RPC, order.repository.ts). Every business decision is made here,
      // in TypeScript, reusing the existing commission calculation
      // functions unchanged (Rule 9) - the RPC only ever writes what it's
      // given, never recomputes anything.
      //
      // sale_price = order_item.line_total (Rule 4): the actual post-
      // discount amount for THIS line only - order.total_amount/subtotal/
      // discount_total are order-level rollups across every item and are
      // never read here. source is NULL (Rule 2/Revision 2): Orders has
      // no source field of its own, so nothing is inferred from Product.
      const staff = await getStaffByName(order.sales_owner);
      const commissionRules = await getActiveCommissionRules();

      const purchaseRows: PurchaseSnapshotInput[] = [];
      const commissionRows: CommissionSnapshotInput[] = [];

      for (const item of items) {
        const rule = findMatchingRule(commissionRules, item.line_total);
        if (!rule) {
          throw new OrderRuleViolationError(
            `Không tìm thấy mức hoa hồng phù hợp cho dòng sản phẩm (mã: ${item.product_id})`
          );
        }

        const purchaseId = crypto.randomUUID();
        purchaseRows.push({
          id: purchaseId,
          customer_id: order.customer_id,
          product_id: item.product_id,
          sale_price: item.line_total,
          // Business Time Migration, Wave 1: no change needed here -
          // order.order_date is already the correct Vietnam business date
          // for every order created after this package ships (set in
          // order.repository.ts's createOrder() via BusinessTime), so this
          // passthrough is correct by construction. Orders created before
          // this package shipped keep whatever (UTC-derived) order_date
          // they were given at creation - Historical rows are LOCKED, no
          // backfill, so completing an old Draft/Reserved order today still
          // snapshots that order's own order_date verbatim, same as before.
          sale_date: order.order_date,
          source: null,
          salesperson: order.sales_owner,
          salesperson_id: staff?.id ?? null,
          order_item_id: item.id!,
        });
        commissionRows.push({
          id: crypto.randomUUID(),
          purchase_id: purchaseId,
          customer_id: order.customer_id,
          salesperson: order.sales_owner,
          salesperson_id: staff?.id ?? null,
          sale_amount: item.line_total,
          commission_percent: rule.commission_percent,
          commission_amount: calculateCommissionAmount(item.line_total, rule.commission_percent),
          status: "Pending",
        });
      }

      // ORDERS_SPEC.md §7: "Reserved --(order Completed)--> Sold" — every
      // reserved line's product becomes Sold.
      const updated = await repository.completeOrder(orderId, purchaseRows, commissionRows);
      await Promise.all(items.map((item) => repository.markProductSold(item.product_id)));
      await repository.appendOrderEvent({
        order_id: orderId,
        event_type: "Status Changed",
        event_detail: `Trạng thái thay đổi: ${order.order_status} → Completed`,
        actor,
      });
      return updated;
    },

    async reassignSalesOwner(input, actor) {
      const order = await requireOrder(repository, input.order_id);
      if (!canReassignSalesOwner(order.order_status)) {
        throw new OrderRuleViolationError("Đơn hàng không ở trạng thái có thể đổi người phụ trách");
      }

      const ownerError = validateReassignSalesOwnerInput(input);
      if (ownerError) {
        throw new OrderValidationError({ sales_owner: ownerError });
      }

      const updated = await repository.reassignSalesOwner(input);
      await repository.appendOrderEvent({
        order_id: input.order_id,
        event_type: "Sales Owner Reassigned",
        event_detail: `Đổi người phụ trách: ${order.sales_owner} → ${input.sales_owner}`,
        actor,
      });
      return updated;
    },
  };
}
