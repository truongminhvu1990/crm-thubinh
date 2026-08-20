import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { orderService } from "../../_service";
import { handleOrderServiceError } from "../../_errors";
import { authorizeOrderCancellation } from "../../_authorization";

/** D12 Order Cancellation, Decision D (LOCKED) — read-only check the
 * Cancel dialog calls before showing its confirm step, to decide whether
 * to render the compensation/commission warning. Same Owner/Manager gate
 * as the actual cancel action (no point revealing this to someone who
 * can't cancel anyway). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const detail = await getOrderDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const authResult = await authorizeOrderCancellation(request);
    if ("error" in authResult) return authResult.error;

    const info = await orderService.getCancellationInfo(id);
    return NextResponse.json(info);
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}
