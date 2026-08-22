import { NextRequest, NextResponse } from "next/server";
import { getSettlementById } from "@/lib/settlement/settlement.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "settlement.view");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const client = await createClient();
  const settlement = await getSettlementById(id, client);
  if (!settlement) return NextResponse.json({ error: "Không tìm thấy settlement" }, { status: 404 });
  return NextResponse.json(settlement);
}
