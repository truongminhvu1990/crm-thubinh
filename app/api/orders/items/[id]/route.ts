import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { orderService } from "../../_service";
import { handleOrderServiceError } from "../../_errors";
import { createClient } from "@/lib/supabase/server";

/** No order ID in this route's own path — per Product Owner decision,
 * order_id is required in the request body. actor = created_by, resolved
 * from that order. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    if (!body.order_id) {
      return NextResponse.json({ error: "order_id is required in the request body" }, { status: 400 });
    }

    // RLS compatibility (2026082211): orders/order_items reads/writes are
    // authenticated-only now.
    const auditClient = await createClient();
    const detail = await getOrderDetail(body.order_id, undefined, auditClient);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const item = await orderService.updateOrderItem({ ...body, id }, detail.order.created_by, auditClient);
    return NextResponse.json(item);
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}

/** Per Product Owner decision, order_id is required as a query parameter
 * for this route (DELETE has no conventional body). actor = created_by,
 * resolved from that order. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = request.nextUrl.searchParams.get("order_id");

  if (!orderId) {
    return NextResponse.json({ error: "order_id query parameter is required" }, { status: 400 });
  }

  try {
    // D5 completion (Product Owner Authorization, 2026-08-19): see
    // app/api/orders/[id]/items/route.ts's identical comment (this route
    // has the same no-Permission-gate-but-session-gated shape). Resolved
    // before the existence check too — orders/order_items reads are
    // authenticated-only now (2026082211).
    const auditClient = await createClient();
    const detail = await getOrderDetail(orderId, undefined, auditClient);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    await orderService.removeProductFromOrder(orderId, id, detail.order.created_by, auditClient);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}
