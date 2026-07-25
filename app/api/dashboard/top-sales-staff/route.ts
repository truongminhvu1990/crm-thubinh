import { NextRequest, NextResponse } from "next/server";
import { getTopSalesStaff } from "@/lib/staff.service";
import { createClient } from "@/lib/supabase/server";

/** Backend API Foundation (Package 4C, Wave 5, revised). */
export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  const client = await createClient();
  const data = await getTopSalesStaff(limit, client);
  return NextResponse.json(data);
}
