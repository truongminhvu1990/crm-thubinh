import { NextRequest, NextResponse } from "next/server";
import { getCommissionDetail } from "@/lib/commission/commission.service";
import { createClient } from "@/lib/supabase/server";

/** Backend API Foundation (Package 4C, Wave 2). Mirrors getCommissionDetail()'s
 * old direct-call shape exactly: always 200, body is the commission or
 * `null` - the Commission Detail page already branches on a null/truthy
 * result, so no new 404 semantics are introduced here. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await createClient();
  const commission = await getCommissionDetail(id, client);
  return NextResponse.json(commission);
}
