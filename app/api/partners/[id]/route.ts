import { NextRequest, NextResponse } from "next/server";
import { getPartnerById, updatePartner } from "@/lib/partner/partner.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "partner.view");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const client = await createClient();
  const partner = await getPartnerById(id, client);
  if (!partner) return NextResponse.json({ error: "Không tìm thấy đối tác" }, { status: 404 });
  return NextResponse.json(partner);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "partner.update");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const changes = await request.json();
    const client = await createClient();
    const partner = await updatePartner(id, changes, auth.staff.id, client);
    return NextResponse.json(partner);
  } catch (error) {
    console.error("Error updating partner:", error);
    return NextResponse.json({ error: "Không thể cập nhật đối tác" }, { status: 500 });
  }
}
