import { NextRequest, NextResponse } from "next/server";
import { getStaffAnalysis } from "@/lib/reports/reportsBI.service";
import { createClient } from "@/lib/supabase/server";
import { parseDateRangeParams } from "../../_shared";

/** Backend API Foundation (Package 4C, Wave 4). */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const range = parseDateRangeParams(searchParams);
  const limit = searchParams.has("limit") ? Number(searchParams.get("limit")) : undefined;

  const client = await createClient();
  const data = await getStaffAnalysis(range, limit, client);
  return NextResponse.json(data);
}
