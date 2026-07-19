import { NextRequest, NextResponse } from "next/server";
import { getOrderList } from "@/lib/orders/order.service";
import { orderService } from "./_service";
import { handleOrderServiceError } from "./_errors";

export async function GET() {
  try {
    const orders = await getOrderList();
    return NextResponse.json(orders);
  } catch (error) {
    return handleOrderServiceError(error);
  }
}

/** actor = created_by (Product Owner rule, until Authentication exists) —
 * for creation, the request body's own created_by is the actor directly. */
export async function POST(request: NextRequest) {
  try {
    const input = await request.json();
    const order = await orderService.createOrder(input, input.created_by);
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return handleOrderServiceError(error);
  }
}
