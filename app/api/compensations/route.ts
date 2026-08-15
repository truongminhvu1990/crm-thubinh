import { NextRequest, NextResponse } from "next/server";
import { getCompensations } from "@/lib/compensation/compensation.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** No POST here — Compensation is never created manually (docs/
 * 13_COMPENSATION_SPEC.md §4: "never created manually"). The only write
 * path is createCompensationsForOrder, called from Order's own
 * completeOrder() (lib/orders/order.service.ts). */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "compensation.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const client = await createClient();
  const compensations = await getCompensations(
    {
      searchTerm: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      compensationType: searchParams.get("compensationType") ?? undefined,
    },
    client
  );
  return NextResponse.json(compensations);
}
