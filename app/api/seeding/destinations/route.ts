import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getDestinations, getDestinationsWithTaskCounts, createDestination } from "@/lib/seeding/seedingDestination.service";
import { handleSeedingError } from "../_errors";

/** Phase 2K-E — a place (Facebook Group today) work can be distributed
 * into. Same seeding.manage permission as execution-accounts and every
 * other planning/resource-management route in this module.
 *
 * Phase 2K-BZ (P2 #5) — `?includeTaskCounts=true` (Account Center's own
 * usage) opts into the one extra query task_count needs; every other
 * existing caller (Distribution's own candidate list) is completely
 * unaffected, still gets the exact plain list it always has, no added
 * query cost. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  try {
    const client = await createClient();
    const includeTaskCounts = request.nextUrl.searchParams.get("includeTaskCounts") === "true";
    const destinations = includeTaskCounts ? await getDestinationsWithTaskCounts(client) : await getDestinations(client);
    return NextResponse.json(destinations);
  } catch (error) {
    return handleSeedingError(error);
  }
}

/** POST { label, permalink_url, notes? } — permalink_url is validated
 * through parseFacebookGroupDestinationUrl server-side; a malformed or
 * non-Group URL is rejected with an honest reason, never guessed. */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  try {
    const input = await request.json();
    const client = await createClient();
    const destination = await createDestination(input, auth.staff.id, client);
    return NextResponse.json(destination, { status: 201 });
  } catch (error) {
    return handleSeedingError(error);
  }
}
