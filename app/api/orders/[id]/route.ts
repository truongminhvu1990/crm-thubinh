import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { orderService } from "../_service";
import { handleOrderServiceError } from "../_errors";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const detail = await getOrderDetail(id);

    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    return handleOrderServiceError(error);
  }
}

/** actor = created_by (Product Owner rule) — resolved by fetching the order
 * first, which also gives a natural 404 before attempting the write. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const detail = await getOrderDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = await orderService.updateOrder(
      { order_id: id, order_date: body.order_date, note: body.note },
      detail.order.created_by
    );
    return NextResponse.json(order);
  } catch (error) {
    return handleOrderServiceError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const detail = await getOrderDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    await orderService.deleteOrder(id, detail.order.created_by);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleOrderServiceError(error);
  }
}
