import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getDestinationById, updateDestination } from "@/lib/seeding/seedingDestination.service";
import { handleSeedingError } from "../../_errors";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    const destination = await getDestinationById(id, client);
    if (!destination) return NextResponse.json({ error: "Destination not found" }, { status: 404 });
    return NextResponse.json(destination);
  } catch (error) {
    return handleSeedingError(error);
  }
}

/** Update — including deactivate (status -> "Inactive") and, as of
 * Phase 2K-AA (PO decision, 2026-08-28), the label and the Facebook Group
 * link itself. permalink_url is re-parsed/re-dedup-checked server-side by
 * updateDestination exactly like create — never accepted pre-parsed. No
 * delete route: destinations are meant to be deactivated, never deleted,
 * so historical tasks always keep a resolvable destination_id. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const client = await createClient();
    const destination = await updateDestination(id, body, auth.staff.id, client);
    return NextResponse.json(destination);
  } catch (error) {
    return handleSeedingError(error);
  }
}
