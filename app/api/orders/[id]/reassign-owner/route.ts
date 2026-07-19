import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { orderService } from "../../_service";
import { handleOrderServiceError } from "../../_errors";

/** ORDERS_UI.md §5/§6 — Reassign Sales Owner. actor = created_by (Product
 * Owner rule), resolved from the parent order. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const detail = await getOrderDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = await orderService.reassignSalesOwner(
      { order_id: id, sales_owner: body.sales_owner },
      detail.order.created_by
    );
    return NextResponse.json(order);
  } catch (error) {
    return handleOrderServiceError(error);
  }
}
