import { NextResponse } from "next/server";
import { getRevenuePeriods } from "@/lib/reports/reportsBI.service";
import { createClient } from "@/lib/supabase/server";

/** Backend API Foundation (Package 4C, Wave 4). */
export async function GET() {
  const client = await createClient();
  const data = await getRevenuePeriods(client);
  return NextResponse.json(data);
}
