import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getExecutionAccountDetail } from "@/lib/seeding/seedingAccountCenter.service";
import { handleSeedingError } from "../../../_errors";

/** Phase 2K-BO — Account Center detail view (Phase 4B). Separate route
 * from the existing GET /api/seeding/execution-accounts/[id] (which
 * returns the plain account row, unchanged, still used by the
 * edit-account flow) rather than modifying that route's response shape
 * for every existing caller. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    const detail = await getExecutionAccountDetail(id, client);
    if (!detail) return NextResponse.json({ error: "Execution account not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (error) {
    return handleSeedingError(error);
  }
}
