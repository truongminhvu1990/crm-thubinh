import { NextRequest, NextResponse } from "next/server";
import { requirePermission, getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";
import { staffHasPermission } from "@/lib/permission/permissionCenter.service";
import { createClient } from "@/lib/supabase/server";
import { getTasksByCampaign, getTasksAssignedToStaff, createTask } from "@/lib/seeding/seedingTask.service";
import { handleSeedingError } from "../_errors";

/** ?campaignId=... (seeding.manage — a campaign's full Task queue) or
 * ?assignedToMe=true (seeding.execute — the calling staff member's own
 * queue across campaigns). Exactly one must be provided. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const campaignId = searchParams.get("campaignId");
  const assignedToMe = searchParams.get("assignedToMe") === "true";

  if (!campaignId && !assignedToMe) {
    return NextResponse.json({ error: "Provide campaignId or assignedToMe=true" }, { status: 400 });
  }

  try {
    const client = await createClient();

    if (assignedToMe) {
      const staff = await getCurrentStaffFromRequest(request);
      if (!staff) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const allowed = await staffHasPermission(staff, "seeding.execute", client);
      if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      const tasks = await getTasksAssignedToStaff(staff.id, client);
      return NextResponse.json(tasks);
    }

    const auth = await requirePermission(request, "seeding.manage");
    if ("error" in auth) return auth.error;

    const tasks = await getTasksByCampaign(campaignId as string, client);
    return NextResponse.json(tasks);
  } catch (error) {
    return handleSeedingError(error);
  }
}

/** Creating/assigning a Task is a seeding.manage action — picking which AI
 * suggestion (or custom text) to hand to which staff member is planning,
 * not execution. */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  try {
    const input = await request.json();
    const client = await createClient();
    const task = await createTask(input, auth.staff.id, client);
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return handleSeedingError(error);
  }
}
