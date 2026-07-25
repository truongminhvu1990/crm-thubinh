import { NextResponse } from "next/server";
import { getDashboardCommissionStats } from "@/lib/commission/commission.service";
import { createClient } from "@/lib/supabase/server";

/** Backend API Foundation (Package 4C, Wave 5, revised). */
export async function GET() {
  const client = await createClient();
  const data = await getDashboardCommissionStats(client);
  return NextResponse.json(data);
}
