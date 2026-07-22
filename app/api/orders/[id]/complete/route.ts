import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { orderService } from "../../_service";
import { handleOrderServiceError } from "../../_errors";

/** ORDERS_UI.md §6 — Complete action. actor = created_by (Product Owner
 * rule), resolved from the parent order. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const detail = await getOrderDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = await orderService.completeOrder(id, detail.order.created_by);
    return NextResponse.json(order);
  } catch (error) {
    return handleOrderServiceError(error, _request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}
