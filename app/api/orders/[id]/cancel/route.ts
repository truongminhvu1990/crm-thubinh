import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { orderService } from "../../_service";
import { handleOrderServiceError } from "../../_errors";
import { authorizeOrderCancellation } from "../../_authorization";
import { createClient } from "@/lib/supabase/server";

/** D12 Order Cancellation (Product Owner Authorization, 2026-08-19).
 * Decision B (LOCKED): Owner/Manager only, via authorizeOrderCancellation -
 * not authorizeOrderWrite (Sales must not reach this route). actor = the
 * current authenticated staff member. auditClient: same D5-completion
 * pattern as .../complete/route.ts / .../lost/route.ts. */
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

    const authResult = await authorizeOrderCancellation(request);
    if ("error" in authResult) return authResult.error;

    const order = await orderService.cancelOrder(
      { order_id: id, dispositions: body.dispositions ?? [] },
      authResult.staff.full_name,
      auditClient
    );
    return NextResponse.json(order);
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}
