import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { orderService } from "../../_service";
import { handleOrderServiceError } from "../../_errors";
import { authorizeOrderWrite } from "../../_authorization";
import { createClient } from "@/lib/supabase/server";

/** Order Customer Editable Before Completion (Product Owner PD, APPROVED
 * 2026-09-22) — dedicated endpoint mirroring reassign-owner/route.ts's own
 * shape, since Customer reassignment is business-rule gated the same way
 * Sales Owner reassignment is. Authorization Engine V2 (Package 4A) —
 * Authentication/Permission/Data Scope enforced via authorizeOrderWrite
 * before the write proceeds, same as every other Orders write endpoint. */
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

    const order = await orderService.changeOrderCustomer(
      { order_id: id, customer_id: body.customer_id },
      authResult.staff.full_name,
      auditClient
    );
    return NextResponse.json(order);
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}
