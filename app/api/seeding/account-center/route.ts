import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getAccountCenterOverview } from "@/lib/seeding/seedingAccountCenter.service";
import { handleSeedingError } from "../_errors";

/** Phase 2K-BO — Seeding Account Center. Read-only overview of both
 * account "types" the business has today: manually-operated Seeding
 * Execution Accounts (always NOT_SUPPORTED for Direct Comment, by
 * design — no credential ever exists) and connected Facebook Pages
 * (AVAILABLE/UNAVAILABLE per their real connection health). Same
 * seeding.manage gate as the rest of the Semi-Seeding admin surface
 * (execution-accounts, destinations, campaigns) — a planning/visibility
 * action, not a new permission. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  try {
    const client = await createClient();
    const overview = await getAccountCenterOverview(client);
    return NextResponse.json(overview);
  } catch (error) {
    return handleSeedingError(error);
  }
}
