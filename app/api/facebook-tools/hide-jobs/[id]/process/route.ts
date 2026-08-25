import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { processNextBatch } from "@/lib/facebookTools/facebookHideJob.service";
import { handleFacebookToolsError } from "../../../_errors";

/** The endpoint the Comment Shield page polls repeatedly while open — each
 * call processes up to HIDE_JOB_BATCH_SIZE comments and returns updated
 * progress. Safe to call again on an already-finished job (no-op). No
 * cron/scheduler calls this; only the Admin's own browser, only while the
 * page is open. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    const progress = await processNextBatch(id, client);
    return NextResponse.json(progress);
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}
