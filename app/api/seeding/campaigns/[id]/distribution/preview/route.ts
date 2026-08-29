import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { previewDistribution } from "@/lib/seeding/seedingDistribution.service";
import { handleSeedingError } from "../../../../_errors";

/** Phase 2K-E — read-only. Performs ZERO database writes (only SELECTs).
 * The client sends only its selection (campaign_target_id, destination_ids,
 * execution_account_ids) — never a computed assignment; the server always
 * computes the round-robin itself, here and again independently in
 * confirm. Same seeding.manage permission as every other planning action
 * in this module. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const input = await request.json();
    const client = await createClient();
    const preview = await previewDistribution(id, input, client);
    return NextResponse.json(preview);
  } catch (error) {
    return handleSeedingError(error);
  }
}
