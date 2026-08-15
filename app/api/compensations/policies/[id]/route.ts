import { NextRequest, NextResponse } from "next/server";
import { updateCompensationPolicy } from "@/lib/compensation/compensation.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "compensation.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const changes = await request.json();
    const client = await createClient();
    const policy = await updateCompensationPolicy(id, changes, auth.staff.id, client);
    return NextResponse.json(policy);
  } catch (error) {
    console.error("Error updating compensation policy:", error);
    return NextResponse.json({ error: "Không thể cập nhật Compensation Policy" }, { status: 500 });
  }
}
