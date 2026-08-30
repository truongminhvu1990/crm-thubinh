import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { removeTargetFromCampaign } from "@/lib/seeding/seedingCampaignTarget.service";
import { handleSeedingError } from "../../../../_errors";

/** Phase 2K-BY (P1 #3) — Remove Target. Same seeding.manage boundary as
 * every other target-management route. removeTargetFromCampaign is
 * deliberately narrow (only a zero-task target can ever be removed) — see
 * its own doc comment for the full data-integrity reasoning. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; targetId: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id, targetId } = await params;

  try {
    const client = await createClient();
    await removeTargetFromCampaign(id, targetId, auth.staff.id, client);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return handleSeedingError(error);
  }
}
