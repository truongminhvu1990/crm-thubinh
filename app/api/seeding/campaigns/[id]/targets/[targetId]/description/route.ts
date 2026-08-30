import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { updateTargetDescription } from "@/lib/seeding/seedingCampaignTarget.service";
import { handleSeedingError } from "../../../../../_errors";

/** Phase 2K-BX — Target Card internal identification description. Same
 * seeding.manage boundary as every other campaign-target management
 * route (GET/POST /targets). This is NEVER an edit to the original
 * Facebook post — updateTargetDescription only ever writes
 * facebook_manual_content_references.source_label, and rejects the
 * request entirely for a Page-backed target (no such field exists for
 * API-synced content). The client sends only free text; server-side
 * validation (campaign exists, target belongs to campaign, target is
 * manual-content-backed, length limit) is the only source of truth. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; targetId: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id, targetId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const description = typeof body.description === "string" ? body.description : "";

    const client = await createClient();
    const result = await updateTargetDescription(id, targetId, description, auth.staff.id, client);
    return NextResponse.json(result);
  } catch (error) {
    return handleSeedingError(error);
  }
}
