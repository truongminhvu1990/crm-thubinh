import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail, getOrderEvents } from "@/lib/orders/order.service";
import { handleOrderServiceError } from "../../_errors";

/** GET /orders/:id/history — the Order Event Timeline (ORDERS_UI.md §9.2)
 * for one order. Existence-checked first so a nonexistent order returns 404
 * rather than an empty array (findOrderEventsByOrderId can't distinguish
 * "no events yet" from "no such order"). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const detail = await getOrderDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const events = await getOrderEvents(id);
    return NextResponse.json(events);
  } catch (error) {
    return handleOrderServiceError(error, _request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}
