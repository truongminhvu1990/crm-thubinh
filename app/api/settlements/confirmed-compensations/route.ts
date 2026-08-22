import { NextRequest, NextResponse } from "next/server";
import { getConfirmedCompensationsForHandOff } from "@/lib/settlement/settlement.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Confirmed compensations — Step 1's own picker data source (Hand Off,
 * before any Settlement can reference them). */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "settlement.manage");
  if ("error" in auth) return auth.error;

  const client = await createClient();
  const compensations = await getConfirmedCompensationsForHandOff(client);
  return NextResponse.json(compensations);
}
