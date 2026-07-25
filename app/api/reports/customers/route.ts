import { NextResponse } from "next/server";
import { getCustomerReportData } from "@/lib/reports/reports.service";
import { createClient } from "@/lib/supabase/server";

/** Backend API Foundation (Package 4C, Wave 4). */
export async function GET() {
  const client = await createClient();
  const data = await getCustomerReportData(client);
  return NextResponse.json(data);
}
