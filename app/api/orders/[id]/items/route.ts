import { NextRequest, NextResponse } from "next/server";
import { getOrderDetail } from "@/lib/orders/order.service";
import { orderService } from "../../_service";
import { handleOrderServiceError } from "../../_errors";
import { createClient } from "@/lib/supabase/server";

/** actor = created_by (Product Owner rule) — resolved from the parent order. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();
    // D5 completion (Product Owner Authorization, 2026-08-19): this route
    // has no Permission/Data Scope gate (Package 4A's named 5 endpoints
    // don't include item-level writes), but proxy.ts's global session gate
    // already guarantees a valid, re-validated authenticated session for
    // every non-/login request — so this authenticated client is available
    // here without adding any new authorization logic, only reading the
    // session cookies that already gated this request. actor is unchanged
    // (still created_by, per the existing Product Owner rule above).
    //
    // RLS compatibility (2026082211): resolved before the existence check
    // too, not just the write below — orders/order_items reads are
    // authenticated-only now, so an anon read here would silently
    // misreport a real order as not found.
    const auditClient = await createClient();
    const detail = await getOrderDetail(id, undefined, auditClient);
    if (!detail) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const item = await orderService.addProductToOrder({ ...body, order_id: id }, detail.order.created_by, auditClient);
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}
