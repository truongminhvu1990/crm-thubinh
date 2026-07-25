import { NextRequest, NextResponse } from "next/server";
import { getCategoryAnalysis } from "@/lib/reports/reportsBI.service";
import { createClient } from "@/lib/supabase/server";
import { parseDateRangeParams } from "../../_shared";

/** Backend API Foundation (Package 4C, Wave 4). */
export async function GET(request: NextRequest) {
  const range = parseDateRangeParams(request.nextUrl.searchParams);
  const client = await createClient();
  const data = await getCategoryAnalysis(range, client);
  return NextResponse.json(data);
}
