import { NextRequest, NextResponse } from "next/server";
import {
  getMonthlySoldProductsPage,
  getMonthlySoldProductsSummary,
} from "@/lib/monthlySoldProducts/monthlySoldProducts.service";
import { MonthlySoldProductsFilters } from "@/types/monthlySoldProducts";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";

/** Monthly Sold Products Report - server-side read endpoint, mirrors
 * app/api/sales-ledger/route.ts's shape (rows+totalCount+summary bundled in
 * one response, server Supabase client, Server Authentication Context for
 * the Data Scope call inside the repository). */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const filters: MonthlySoldProductsFilters = {
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    month: searchParams.get("month") ?? undefined,
    salespersonId: searchParams.get("salespersonId") ?? undefined,
    productCategory: searchParams.get("productCategory") ?? undefined,
    customer: searchParams.get("customer") ?? undefined,
    page: Number(searchParams.get("page") ?? "1"),
  };

  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);
  const [page, summary] = await Promise.all([
    getMonthlySoldProductsPage(filters, client, staff),
    getMonthlySoldProductsSummary(filters, client, staff),
  ]);

  return NextResponse.json({ ...page, summary });
}
