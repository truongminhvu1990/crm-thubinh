import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getConnectedPages } from "@/lib/facebookTools/facebookPage.service";
import { handleSeedingError } from "../_errors";

/** Semi Seeding's own read of "which Facebook Pages are connected," gated
 * by seeding.manage — deliberately not a proxy to /api/facebook-tools/pages
 * (gated by facebook_tools.manage, a separate permission a Semi Seeding
 * manager may not hold). Reuses facebookPage.service.ts directly, which is
 * exactly the reuse boundary that service was built for: the shared
 * SERVICE is reusable across modules, each module's own API route keeps
 * its own permission gate. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  try {
    const client = await createClient();
    const pages = await getConnectedPages(client);
    return NextResponse.json(pages);
  } catch (error) {
    return handleSeedingError(error);
  }
}
