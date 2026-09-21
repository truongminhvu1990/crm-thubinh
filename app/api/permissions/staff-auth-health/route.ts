import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { getStaffAuthHealthSummary } from "@/lib/permission/staffAuthHealth";
import { createClient } from "@/lib/supabase/server";
import { handlePermissionServiceError } from "../_errors";

/** Diagnostic-only staff <-> auth.users identity-link health check
 * (Production Authorization Incident, 2026-09-21) - gated the same as the
 * rest of Permission Center (`settings.manage`). Returns aggregate counts
 * only, never raw staff/email data (see `lib/permission/staffAuthHealth.ts`).
 * Never modifies any identity - a repair is always a separate, explicit,
 * reviewed Production write, never automatic. */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const client = await createClient();
    const summary = await getStaffAuthHealthSummary(client);
    return NextResponse.json(summary);
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}
