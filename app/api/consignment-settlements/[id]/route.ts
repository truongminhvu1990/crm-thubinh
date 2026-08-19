import { NextRequest, NextResponse } from "next/server";
import { getConsignmentSettlementById } from "@/lib/consignment/consignmentSettlement.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "settlement.view");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const client = await createClient();
  const settlement = await getConsignmentSettlementById(id, client);
  if (!settlement) return NextResponse.json({ error: "Không tìm thấy consignment settlement" }, { status: 404 });
  return NextResponse.json(settlement);
}
