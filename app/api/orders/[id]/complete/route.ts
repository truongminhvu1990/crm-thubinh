import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { orderService } from "../../_service";
import { handleOrderServiceError } from "../../_errors";
import { authorizeOrderWrite } from "../../_authorization";
import { createClient } from "@/lib/supabase/server";

/** ORDERS_UI.md §6 — Complete action. Authorization Engine V2 (Package 4A) —
 * Authentication/Permission/Data Scope enforced via authorizeOrderWrite
 * before the write proceeds. actor = the current authenticated staff member
 * performing this action (Product Owner review: not order.created_by). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    // D5 completion (Product Owner Authorization, 2026-08-19): an
    // authenticated client bound to this request's own validated session
    // cookies, so the audit_log entry for Reserved -> Sold passes RLS.
    //
    // RLS compatibility (2026082211): resolved before the existence check
    // too, not just the write below — orders/order_items reads are
    // authenticated-only now.
    const auditClient = await createClient();
    const detail = await getOrderDetail(id, undefined, auditClient);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const authResult = await authorizeOrderWrite(request, detail.order);
    if ("error" in authResult) return authResult.error;

    const order = await orderService.completeOrder(id, authResult.staff.full_name, auditClient);
    return NextResponse.json(order);
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}
