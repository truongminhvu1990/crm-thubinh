import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getCampaignById, updateCampaign } from "@/lib/seeding/seedingCampaign.service";
import { handleSeedingError } from "../../_errors";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    const campaign = await getCampaignById(id, client);
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    return NextResponse.json(campaign);
  } catch (error) {
    return handleSeedingError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const changes = await request.json();
    const client = await createClient();
    const campaign = await updateCampaign(id, changes, auth.staff.id, client);
    return NextResponse.json(campaign);
  } catch (error) {
    return handleSeedingError(error);
  }
}
