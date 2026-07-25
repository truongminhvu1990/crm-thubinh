import { NextRequest, NextResponse } from "next/server";
import { getCommissionList } from "@/lib/commission/commission.service";
import { CommissionListFilters, CommissionStatus } from "@/types/commission";
import { createClient } from "@/lib/supabase/server";

/** Backend API Foundation (Package 4C, Wave 2) - Commissions' server-side
 * read endpoint. Reuses getCommissionList() unchanged (filters, customer-name
 * enrichment) with a server Supabase client instead of the browser one -
 * data access only, no new filtering, no permission check (none existed
 * before this route either). */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const filters: CommissionListFilters = {
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    salesperson: searchParams.get("salesperson") ?? undefined,
    status: (searchParams.get("status") as CommissionStatus | null) ?? undefined,
  };

  const client = await createClient();
  const commissions = await getCommissionList(filters, client);
  return NextResponse.json(commissions);
}
