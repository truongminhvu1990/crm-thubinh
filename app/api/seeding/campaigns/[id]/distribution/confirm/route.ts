import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { confirmDistribution } from "@/lib/seeding/seedingDistribution.service";
import { handleSeedingError } from "../../../../_errors";

/** Phase 2K-E — creates the generated seeding_tasks (Architecture C: the
 * only persisted output of a distribution operation, plus one existing-
 * shape logActivity entry — no batch/run table). The client resubmits the
 * exact same selection shape preview accepts (campaign_target_id,
 * destination_ids, execution_account_ids) — never a client-computed
 * assignment; confirmDistribution re-validates every resource's current
 * Active status and recomputes the round-robin fresh, server-side, before
 * writing anything. A stale selection (a resource deactivated since
 * preview) is rejected outright, never silently redistributed over the
 * survivors. Not atomic across generated rows (Supabase JS has no multi-
 * row transaction, same established convention as every other bulk
 * seeding write) — partial completion is honestly reported, never rolled
 * back or silently claimed complete. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const input = await request.json();
    const client = await createClient();
    const result = await confirmDistribution(id, input, auth.staff.id, client);
    return NextResponse.json(result);
  } catch (error) {
    return handleSeedingError(error);
  }
}
