import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { retryFailedComments } from "@/lib/facebookTools/facebookHideJob.service";
import { handleFacebookToolsError } from "../../../_errors";

/** "Thử lại các comment lỗi" — re-queues permanently-failed comment rows for
 * a fresh drain via hide-jobs/[id]/process, without re-fetching the comment
 * id list from Graph API. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    const job = await retryFailedComments(id, client);
    return NextResponse.json(job);
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}
