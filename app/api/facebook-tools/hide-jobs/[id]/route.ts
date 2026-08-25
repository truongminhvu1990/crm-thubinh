import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getHideJobById } from "@/lib/facebookTools/facebookHideJob.service";
import { handleFacebookToolsError } from "../../_errors";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    const job = await getHideJobById(id, client);
    if (!job) return NextResponse.json({ error: "Hide job not found" }, { status: 404 });
    return NextResponse.json(job);
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}
