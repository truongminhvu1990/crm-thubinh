import { NextRequest, NextResponse } from "next/server";
import { getReferredOrderCounts } from "@/lib/partner/partner.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Partner List's "Total Referred Orders" column — one batched query for
 * every partner on the current page, rather than N requests. Returns
 * { [partnerId]: count }; a partner absent from the response has 0. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "partner.view");
  if ("error" in auth) return auth.error;

  const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const client = await createClient();
  const counts = await getReferredOrderCounts(ids, client);
  return NextResponse.json(Object.fromEntries(counts));
}
