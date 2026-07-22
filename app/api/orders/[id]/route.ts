import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";
import { orderService } from "../_service";
import { handleOrderServiceError } from "../_errors";

/** Data Scope Rollout (Sprint v4.1), Package 2 - see app/api/orders/route.ts
 * for the same reasoning. An out-of-scope order id resolves to the exact
 * same 404 a genuinely nonexistent id already produces (DATA_SCOPE_ROLLOUT_
 * UI.md §3 - "not found," never a distinguishable "forbidden"). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const staff = await getCurrentStaffFromRequest(request);
    if (!staff) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const detail = await getOrderDetail(id, staff);

    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
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
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
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
    return handleOrderServiceError(error, _request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}
