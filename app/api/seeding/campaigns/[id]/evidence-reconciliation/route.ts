import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { reconcileNextBatch, getEvidenceQueueForCampaign, DEFAULT_BATCH_SIZE } from "@/lib/seeding/seedingEvidenceReconciliation.service";
import { handleSeedingError } from "../../../_errors";

/** Phase 2F — manager-only (seeding.manage), never seeding.execute: this is
 * a review tool, not part of a staff member's own task queue. GET reads the
 * current evidence queue (every Comment task + its latest result, nulls if
 * never checked); POST runs one bounded batch round. Reconnect-required /
 * generic Facebook-fetch failures are caught INSIDE reconcileNextBatch and
 * persisted as per-task results ("Reconnect Required" / "Evidence
 * Unavailable") — they never reach this handler as a thrown error, so a
 * bad Page token never crashes the whole batch. handleSeedingError below is
 * a defensive fallback for genuinely unexpected failures only (campaign not
 * found, DB error, etc). */

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  try {
    const client = await createClient();
    const queue = await getEvidenceQueueForCampaign(id, client);
    return NextResponse.json(queue);
  } catch (error) {
    return handleSeedingError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  try {
    const client = await createClient();
    const result = await reconcileNextBatch(id, DEFAULT_BATCH_SIZE, auth.staff.id, client);
    return NextResponse.json(result);
  } catch (error) {
    return handleSeedingError(error);
  }
}
