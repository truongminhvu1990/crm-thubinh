import { NextRequest, NextResponse } from "next/server";
import { getOrdersByPartnerId } from "@/lib/partner/partner.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Partner Detail's Orders section (docs/12_PARTNER_CENTER_SPEC.md §7,
 * Order Attribution — reads via partner_id only, never through Order's own
 * service code, per Read Model Strategy, database/foundation/
 * 17_DATABASE_FOUNDATION.md §6). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "partner.view");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const client = await createClient();
  const orders = await getOrdersByPartnerId(id, client);
  return NextResponse.json(orders);
}
