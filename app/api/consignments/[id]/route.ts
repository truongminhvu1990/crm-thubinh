import { NextRequest, NextResponse } from "next/server";
import { getConsignmentById } from "@/lib/consignment/consignment.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "consignment.view");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const client = await createClient();
  const consignment = await getConsignmentById(id, client);
  if (!consignment) return NextResponse.json({ error: "Không tìm thấy consignment" }, { status: 404 });
  return NextResponse.json(consignment);
}
