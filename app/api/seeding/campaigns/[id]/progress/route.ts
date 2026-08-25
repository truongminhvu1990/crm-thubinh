import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getCampaignProgress } from "@/lib/seeding/seedingCampaignTarget.service";
import { handleSeedingError } from "../../../_errors";

/** Aggregated task counts across every target of a campaign — total /
 * pending / inProgress / done / failed / skipped / cancelled. Failed is
 * always its own number, never folded into done. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    const progress = await getCampaignProgress(id, client);
    return NextResponse.json(progress);
  } catch (error) {
    return handleSeedingError(error);
  }
}
