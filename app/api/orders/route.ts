import { NextRequest, NextResponse } from "next/server";
import { getOrderList } from "@/lib/orders/order.service";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";
import { orderService } from "./_service";
import { handleOrderServiceError } from "./_errors";
import { createClient } from "@/lib/supabase/server";

/** Data Scope Rollout (Sprint v4.1), Package 2 - resolves the calling staff
 * member so `getOrderList` can apply Own/Team/All (DATA_SCOPE_ROLLOUT_
 * SPEC.md §3). Not a new access gate: this route was already only
 * reachable by an authenticated session (proxy.ts's login gate covers
 * every API route already); this only adds *which* rows that session sees,
 * not whether the request is allowed to reach the route at all. A signed-
 * in user with no matching `staff` row (same edge case `getCurrentStaff()`
 * already documents) sees an empty list rather than unscoped data. */
export async function GET(request: NextRequest) {
  try {
    const staff = await getCurrentStaffFromRequest(request);
    // No resolvable staff row for this authenticated session -> no data,
    // never an unscoped fallback (§3 above: undefined skips scoping
    // entirely, which is only safe for callers that don't need it).
    if (!staff) return NextResponse.json([]);

    // RLS compatibility (2026082211): orders is authenticated-only now — an
    // anon read here would silently return an empty list, not an error.
    const client = await createClient();
    const orders = await getOrderList(staff, client);
    return NextResponse.json(orders);
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}

/** actor = created_by (Product Owner rule, until Authentication exists) —
 * for creation, the request body's own created_by is the actor directly. */
export async function POST(request: NextRequest) {
  try {
    const input = await request.json();
    // RLS compatibility (2026082211): orders INSERT is authenticated-only now.
    const auditClient = await createClient();
    const order = await orderService.createOrder(input, input.created_by, auditClient);
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return handleOrderServiceError(error, request.headers.get("x-vercel-id") ?? crypto.randomUUID());
  }
}
