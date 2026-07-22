import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { orderService } from "../../_service";
import { handleOrderServiceError } from "../../_errors";

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

    const detail = await getOrderDetail(body.order_id);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const item = await orderService.updateOrderItem({ ...body, id }, detail.order.created_by);
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
    const detail = await getOrderDetail(orderId);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    await orderService.removeProductFromOrder(orderId, id, detail.order.created_by);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}
