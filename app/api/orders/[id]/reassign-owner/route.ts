import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { orderService } from "../../_service";
import { handleOrderServiceError } from "../../_errors";
import { authorizeOrderWrite } from "../../_authorization";
import { createClient } from "@/lib/supabase/server";

/** ORDERS_UI.md §5/§6 — Reassign Sales Owner. Authorization Engine V2
 * (Package 4A) — Authentication/Permission/Data Scope enforced via
 * authorizeOrderWrite before the write proceeds. actor = the current
 * authenticated staff member performing this action (Product Owner review:
 * not order.created_by). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    // RLS compatibility (2026082211): resolved before the existence check
    // too — orders/order_items reads are authenticated-only now.
    const auditClient = await createClient();
    const detail = await getOrderDetail(id, undefined, auditClient);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const authResult = await authorizeOrderWrite(request, detail.order);
    if ("error" in authResult) return authResult.error;

    const order = await orderService.reassignSalesOwner(
      { order_id: id, sales_owner: body.sales_owner },
      authResult.staff.full_name,
      auditClient
    );
    return NextResponse.json(order);
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}
