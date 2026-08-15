import { NextRequest, NextResponse } from "next/server";
import { getPartnerOrderStats } from "@/lib/partner/partner.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Partner Detail's Partner Statistics section — Total/Successful Orders
 * and Revenue Generated, computed from Order Attribution (partner_id).
 * Compensation-derived figures (Total/Paid/Outstanding Compensation) are
 * NOT computed here — Compensation Module has no implementation anywhere
 * yet (Product Owner Revision 2026-07-31, Decision 2: display 0 until it
 * exists, a fixed UI value, not a query result). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "partner.view");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const client = await createClient();
  const stats = await getPartnerOrderStats(id, client);
  return NextResponse.json(stats);
}
