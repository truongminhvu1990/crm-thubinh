import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { disconnectPage } from "@/lib/facebookTools/facebookPage.service";
import { handleFacebookToolsError } from "../../_errors";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    await disconnectPage(id, auth.staff.id, client);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}
