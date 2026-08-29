import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { reassignCampaignPage } from "@/lib/seeding/seedingCampaign.service";
import { handleSeedingError } from "../../../_errors";

/** Phase 2K-BP — Reassign Connected Page. A human-initiated,
 * one-campaign-at-a-time admin action — same seeding.manage boundary as
 * every other campaign-configuration write (status/name/objective
 * updates). The client only ever sends a facebook_page_id string;
 * server-side validation (reassignCampaignPage) is the only place that
 * decides whether it's a real, connected Page — this route never trusts
 * it directly. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const facebookPageId = typeof body.facebook_page_id === "string" ? body.facebook_page_id : "";
    const client = await createClient();
    const campaign = await reassignCampaignPage(id, facebookPageId, auth.staff.id, client);
    return NextResponse.json(campaign);
  } catch (error) {
    return handleSeedingError(error);
  }
}
