import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { orderService } from "../../_service";
import { handleOrderServiceError } from "../../_errors";

/** actor = created_by (Product Owner rule) — resolved from the parent order. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const detail = await getOrderDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const item = await orderService.addProductToOrder({ ...body, order_id: id }, detail.order.created_by);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return handleOrderServiceError(error);
  }
}
