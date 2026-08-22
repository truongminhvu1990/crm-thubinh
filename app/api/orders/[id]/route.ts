import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";
import { orderService } from "../_service";
import { handleOrderServiceError } from "../_errors";
import { authorizeOrderWrite } from "../_authorization";
import { createClient } from "@/lib/supabase/server";

/** Data Scope Rollout (Sprint v4.1), Package 2 - see app/api/orders/route.ts
 * for the same reasoning. An out-of-scope order id resolves to the exact
 * same 404 a genuinely nonexistent id already produces (DATA_SCOPE_ROLLOUT_
 * UI.md §3 - "not found," never a distinguishable "forbidden"). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const staff = await getCurrentStaffFromRequest(request);
    if (!staff) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // RLS compatibility (2026082211): orders/order_items reads are
    // authenticated-only now — an anon read here would silently return
    // null, misreporting a real order as not found.
    const client = await createClient();
    const detail = await getOrderDetail(id, staff, client);

    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}

/** actor = created_by (Product Owner rule) — resolved by fetching the order
 * first, which also gives a natural 404 before attempting the write. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    // RLS compatibility (2026082211): see GET above.
    const auditClient = await createClient();
    const detail = await getOrderDetail(id, undefined, auditClient);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = await orderService.updateOrder(
      { order_id: id, order_date: body.order_date, note: body.note },
      detail.order.created_by,
      auditClient
    );
    return NextResponse.json(order);
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}

/** Authorization Engine V2 (Package 4A) — Authentication/Permission/Data
 * Scope enforced via authorizeOrderWrite before the delete proceeds. actor =
 * the current authenticated staff member performing this action (Product
 * Owner review: not order.created_by) — though note deleteOrder itself
 * persists no audit record today (order + its order_events cascade-delete
 * together, per order.service.ts's own "deleteOrder logs nothing" design),
 * so this value has no observable effect yet; passed for interface
 * consistency and in case that changes.
 *
 * `adminOverride` (Product Owner Decision, 2026-08-14): Owner is the only
 * role_key this lifts the lifecycle-status gate for — resolved via the same
 * `role` authorizeOrderWrite already computes, never inferred from anything
 * client-supplied. `authResult.staff.id` is passed through as the server-
 * verified actor for the admin/reconciliation path only — this is the
 * value delete_order_with_reconciliation's own `p_staff_id` argument
 * independently re-verifies as an active Owner (2026081717 migration); the
 * browser never has any path to call that RPC directly. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    // RLS compatibility (2026082211): see GET above.
    const auditClient = await createClient();
    const detail = await getOrderDetail(id, undefined, auditClient);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const authResult = await authorizeOrderWrite(request, detail.order);
    if ("error" in authResult) return authResult.error;

    const adminOverride = authResult.role.role_key === "Owner";
    await orderService.deleteOrder(id, authResult.staff.full_name, adminOverride, authResult.staff.id, auditClient);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}
