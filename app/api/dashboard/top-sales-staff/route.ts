import { NextRequest, NextResponse } from "next/server";
import { getTopSalesStaff } from "@/lib/staff.service";
import { createClient } from "@/lib/supabase/server";
import { DateRange } from "@/lib/dateFilter";

/** Backend API Foundation (Package 4C, Wave 5, revised). */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const range: DateRange | null = start && end ? { start, end } : null;

  const client = await createClient();
  const data = await getTopSalesStaff(limit, client, range);
  return NextResponse.json(data);
}
