import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { orderService } from "../../_service";
import { handleOrderServiceError } from "../../_errors";
import { authorizeOrderWrite } from "../../_authorization";

/** Add-only, per ORDERS_UI.md §8 — no PUT/DELETE route exists for payments.
 * Authorization Engine V2 (Package 4A) — Authentication/Permission/Data
 * Scope enforced via authorizeOrderWrite before the write proceeds. actor =
 * the current authenticated staff member performing this action (Product
 * Owner review: not order.created_by). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const detail = await getOrderDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const authResult = await authorizeOrderWrite(request, detail.order);
    if ("error" in authResult) return authResult.error;

    const payment = await orderService.addPayment({ ...body, order_id: id }, authResult.staff.full_name);
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}
