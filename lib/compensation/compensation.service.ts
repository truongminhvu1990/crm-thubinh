import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  Compensation,
  CompensationPolicy,
  CreateCompensationPolicyInput,
  UpdateCompensationPolicyInput,
} from "@/types/compensation";
import { Order, OrderItem } from "@/types/order";
import { logActivity } from "@/lib/activityLog.service";

/** Compensation (docs/13_COMPENSATION_SPEC.md, LOCKED Rev 3/4). Never
 * created manually — createCompensationsForOrder is the only write path
 * that inserts a new record, called exclusively from Order's own
 * reserveOrder() (lib/orders/order.service.ts), the point that corresponds
 * 1:1 to the OrderConfirmed Business Event (Draft→Reserved,
 * docs/EVENT_CATALOG.md §14/ORDERS_DATABASE.md §8). This codebase has no
 * real Business Event bus anywhere (Commission's own architecture proposal,
 * docs/COMMISSION_ARCHITECTURE_REVISION_PROPOSAL.md, is still unapproved) —
 * this is the honest, working equivalent of "subscribing to OrderConfirmed"
 * available today: Order (the Publisher) calls this function directly at
 * the exact moment it would otherwise publish the event, and this function
 * never reaches back into Order's own tables to decide whether/when to run.
 *
 * Lifecycle (Product Owner Revision 2026-07-31, Decisions 1–3):
 * Draft (created here, at OrderConfirmed) -> Pending (markCompensationsEligible,
 * called from completeOrder() — Eligibility "may delay confirmation, but
 * must never change the creation trigger") -> Confirmed (confirmCompensation,
 * manual, compensation.manage, Payment Status = Paid gate) -> Handed Off
 * (status exists; unreachable — Settlement has no implementation and is
 * explicitly out of scope). Cancelled (cancelCompensationsForOrder, called
 * from markOrderLost()) is reachable from Draft/Pending only. */

const WITH_JOINS =
  "*, partner:partners(id, name, partner_code, partner_type, status), order:orders(id, order_number, order_date), customer:customers(id, full_name, customer_code), product:products(id, product_name, product_code)";

async function generateCompensationCode(client: SupabaseClient): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `COMP-${datePart}-`;

  const { data, error } = await client.from("compensations").select("id").like("compensation_code", `${prefix}%`);
  if (error) throw error;

  const sequence = (data?.length ?? 0) + 1;
  return `${prefix}${String(sequence).padStart(6, "0")}`;
}

/** Auto-creation trigger — OrderConfirmed (Draft→Reserved), per Product
 * Owner Revision 2026-07-31, Decision 1 ("must never move to Order
 * Completed"). Only fires when the Order has an Attributed Partner
 * (order.partner_id) — Recipient is Compensation's own abstract concept
 * (§1), but Partner is the only recipient-type data wired to Order today
 * (this increment's scope decision). One row per Order Item, mirroring
 * sales_commissions' own granularity — created as **Draft**, since at
 * OrderConfirmed the order may still have no items, or items whose price
 * hasn't settled yet; Eligibility (markCompensationsEligible, below) is
 * what advances a Draft to Pending, never this function. Best-effort: a
 * failure here is logged, never thrown back into Order's own reserveOrder()
 * — Order completing that transition successfully must never depend on its
 * Subscriber's own bookkeeping succeeding.
 *
 * Product Owner Decision 12 (LOCKED) — supersedes the prior "pick whichever
 * Compensation Policy is Active" behavior (confirmed root cause of the
 * OD-20260812-000001 test case incorrectly resolving to a 5% Policy no one
 * chose for that Order). Order is now the source of truth for its own
 * Compensation Method/Value: `order.compensation_method`/`order.
 * compensation_value` are read directly, no `compensation_policies` query
 * happens here at all. `compensation_type` is fixed to "Commission"
 * (Decision 12b — literal, not a rate/amount, so not covered by the
 * no-hardcoding rule) and `policy_id` is null (Decision 7 — Policy no
 * longer backs an Order-level Compensation). reserveOrder()
 * (order.service.ts) already rejects the Reserve transition before this
 * function ever runs if the Order has a Partner but no valid Method/Value
 * (Decision 12c) — the null-check below is defensive only, matching this
 * function's own best-effort/never-throws contract.
 *
 * Known limitation, stated rather than hidden: this fires once, at the
 * moment of the OrderConfirmed transition itself. An item added to the
 * order afterward does not retroactively get its own Compensation row —
 * the task specifies a single named trigger event, not a second one for
 * "item added after Reserved." */
export async function createCompensationsForOrder(
  order: Order,
  items: OrderItem[],
  client: SupabaseClient = supabase
): Promise<void> {
  if (!order.partner_id) return;
  if (!order.compensation_method || order.compensation_value === undefined || order.compensation_value === null) {
    console.error("Order has a Partner but no Compensation Method/Value — skipping compensation creation:", order.id);
    return;
  }

  const method = order.compensation_method;
  const value = order.compensation_value;

  try {
    for (const item of items) {
      const calculated_amount = method === "Percentage" ? Math.round(item.line_total * (value / 100)) : value;

      const compensation_code = await generateCompensationCode(client);
      const { data, error } = await client
        .from("compensations")
        .insert({
          compensation_code,
          recipient_type: "Partner",
          partner_id: order.partner_id,
          compensation_type: "Commission",
          policy_id: null,
          order_id: order.id,
          order_item_id: item.id,
          customer_id: order.customer_id,
          product_id: item.product_id,
          basis: "Sale Price",
          method,
          value,
          calculated_amount,
          status: "Draft",
        })
        .select()
        .single();
      if (error) throw error;

      await logActivity({ staff_id: null, action: "compensation_created", entity: "compensation", entity_id: data.id });
    }
  } catch (error) {
    console.error("Error creating compensation for order:", order.id, error);
  }
}

/** Eligibility step (Product Owner Revision 2026-07-31, Decision 2:
 * "Eligibility may delay confirmation, but must never change the creation
 * trigger") — called from Order's own completeOrder(), NOT from
 * reserveOrder(). Advances every Draft Compensation tied to this order to
 * Pending, i.e. ready for a staff member to Confirm (still separately
 * gated on Payment Status = Paid at that step, confirmCompensation below).
 * Best-effort, same reasoning as createCompensationsForOrder. */
export async function markCompensationsEligible(orderId: string, client: SupabaseClient = supabase): Promise<void> {
  try {
    const { data, error } = await client
      .from("compensations")
      .update({ status: "Pending" })
      .eq("order_id", orderId)
      .eq("status", "Draft")
      .select("id");
    if (error) throw error;

    for (const row of data ?? []) {
      await logActivity({ staff_id: null, action: "compensation_eligible", entity: "compensation", entity_id: row.id });
    }
  } catch (error) {
    console.error("Error marking compensation eligible for order:", orderId, error);
  }
}

/** Called from Order's own markOrderLost() — an Order that falls through
 * after being Confirmed-into-existence-as-Draft must not leave orphaned
 * Draft/Pending Compensation records behind. Confirmed/Handed Off records
 * are never touched here — once Confirmed, a Compensation is read-only
 * (task's own rule); Cancelled is only reachable from Draft/Pending,
 * mirroring how Order's own Lost is only reachable from Draft/Reserved.
 * Best-effort, same reasoning as createCompensationsForOrder. */
export async function cancelCompensationsForOrder(orderId: string, client: SupabaseClient = supabase): Promise<void> {
  try {
    const { data, error } = await client
      .from("compensations")
      .update({ status: "Cancelled", cancelled_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .in("status", ["Draft", "Pending"])
      .select("id");
    if (error) throw error;

    for (const row of data ?? []) {
      await logActivity({ staff_id: null, action: "compensation_cancelled", entity: "compensation", entity_id: row.id });
    }
  } catch (error) {
    console.error("Error cancelling compensation for order:", orderId, error);
  }
}

export interface CompensationListFilters {
  searchTerm?: string;
  status?: string;
  compensationType?: string;
}

export async function getCompensations(
  filters: CompensationListFilters = {},
  client: SupabaseClient = supabase
): Promise<Compensation[]> {
  let query = client.from("compensations").select(WITH_JOINS);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.compensationType) query = query.eq("compensation_type", filters.compensationType);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching compensations:", error);
    return [];
  }

  let rows = data as unknown as Compensation[];
  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    rows = rows.filter(
      (c) =>
        c.compensation_code.toLowerCase().includes(term) ||
        c.partner?.name?.toLowerCase().includes(term) ||
        c.order?.order_number?.toLowerCase().includes(term) ||
        c.customer?.full_name?.toLowerCase().includes(term) ||
        c.product?.product_name?.toLowerCase().includes(term)
    );
  }
  return rows;
}

export async function getCompensationById(id: string, client: SupabaseClient = supabase): Promise<Compensation | null> {
  const { data, error } = await client.from("compensations").select(WITH_JOINS).eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching compensation:", error);
    return null;
  }
  return data as unknown as Compensation | null;
}

export class CompensationRuleViolationError extends Error {}

/** compensation.manage-gated (enforced by the API route, not here). Pending
 * -> Confirmed only — Compensation is read-only after Confirmed (task's own
 * rule, matches §4's Lifecycle). BR-001-gated: mirrors Commission's own
 * documented Approval gate (docs/06_COMMISSION_SPEC.md §8/§9) — a
 * Compensation record cannot be Confirmed until its Order's Payment Status
 * has reached Paid. This reads Order's own `payment_status` column, which
 * §11 explicitly permits ("Compensation may read... Payment Status
 * (Eligibility gating)... read-only") — distinct from the Order relationship
 * itself (Business Event Subscription only, no query), which this function
 * does not touch: it reads an already-created Compensation row's own
 * `order_id`, not deciding whether/when to create anything. */
export async function confirmCompensation(
  id: string,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<Compensation> {
  const compensation = await getCompensationById(id, client);
  if (!compensation) throw new CompensationRuleViolationError("Không tìm thấy compensation");
  if (compensation.status !== "Pending") {
    throw new CompensationRuleViolationError(`Không thể xác nhận từ trạng thái "${compensation.status}"`);
  }

  const { data: order, error: orderError } = await client
    .from("orders")
    .select("payment_status")
    .eq("id", compensation.order_id)
    .single();
  if (orderError) throw orderError;
  if (order.payment_status !== "Paid") {
    throw new CompensationRuleViolationError("Chỉ có thể xác nhận khi đơn hàng đã thanh toán đủ (Payment Status = Paid)");
  }

  const { data, error } = await client
    .from("compensations")
    .update({ status: "Confirmed", confirmed_at: new Date().toISOString(), confirmed_by: actorStaffId })
    .eq("id", id)
    .select(WITH_JOINS)
    .single();
  if (error) throw error;

  await logActivity({ staff_id: actorStaffId, action: "compensation_confirmed", entity: "compensation", entity_id: id });
  return data as unknown as Compensation;
}

export async function getCompensationPolicies(client: SupabaseClient = supabase): Promise<CompensationPolicy[]> {
  const { data, error } = await client.from("compensation_policies").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching compensation policies:", error);
    return [];
  }
  return data as CompensationPolicy[];
}

/** compensation.manage-gated (enforced by the API route, not here) — §13
 * names "configuring Policies" explicitly as part of that permission's
 * scope. Basis is accepted as an input field (not hardcoded here) but the
 * UI only ever sends "Sale Price" today (docs/13_COMPENSATION_SPEC.md §9 —
 * no other Basis has a calculation formula, so no other Basis is offered). */
export async function createCompensationPolicy(
  input: CreateCompensationPolicyInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<CompensationPolicy> {
  const { data, error } = await client.from("compensation_policies").insert(input).select().single();
  if (error) throw error;

  await logActivity({
    staff_id: actorStaffId,
    action: "compensation_policy_created",
    entity: "compensation_policy",
    entity_id: data.id,
  });
  return data as CompensationPolicy;
}

export async function updateCompensationPolicy(
  id: string,
  changes: UpdateCompensationPolicyInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<CompensationPolicy> {
  const { data, error } = await client.from("compensation_policies").update(changes).eq("id", id).select().single();
  if (error) throw error;

  await logActivity({
    staff_id: actorStaffId,
    action: "compensation_policy_updated",
    entity: "compensation_policy",
    entity_id: id,
  });
  return data as CompensationPolicy;
}

/** Settlement (docs/14_SETTLEMENT_SPEC.md, Module: Settlement, Product
 * Owner Implementation Task 2026-07-31) — the receiving-side counterpart to
 * this module's own §4 Lifecycle ("Handed Off... Compensation hands off a
 * Confirmed record to Settlement"). Added as a new, standalone function
 * only — no existing Compensation function, page, or business rule is
 * touched by the Settlement task ("Do NOT modify Compensation"). Called
 * exclusively from Settlement's own creation flow
 * (lib/settlement/settlement.service.ts createSettlement), at the exact
 * moment a Settlement Request is created for this Compensation record —
 * never from anywhere inside this file itself. Confirmed -> Handed Off
 * only; anything else throws, since only a Confirmed record can be hand-
 * off-eligible (docs/14_SETTLEMENT_SPEC.md §8). */
export async function handOffCompensation(
  id: string,
  client: SupabaseClient = supabase
): Promise<Compensation> {
  const compensation = await getCompensationById(id, client);
  if (!compensation) throw new CompensationRuleViolationError("Không tìm thấy compensation");
  if (compensation.status !== "Confirmed") {
    throw new CompensationRuleViolationError(`Không thể chuyển giao từ trạng thái "${compensation.status}"`);
  }

  const { data, error } = await client
    .from("compensations")
    .update({ status: "Handed Off" })
    .eq("id", id)
    .select(WITH_JOINS)
    .single();
  if (error) throw error;

  await logActivity({ staff_id: null, action: "compensation_handed_off", entity: "compensation", entity_id: id });
  return data as unknown as Compensation;
}
