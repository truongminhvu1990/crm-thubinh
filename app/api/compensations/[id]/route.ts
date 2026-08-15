import { NextRequest, NextResponse } from "next/server";
import { getCompensationById } from "@/lib/compensation/compensation.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "compensation.view");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const client = await createClient();
  const compensation = await getCompensationById(id, client);
  if (!compensation) return NextResponse.json({ error: "Không tìm thấy compensation" }, { status: 404 });
  return NextResponse.json(compensation);
}
