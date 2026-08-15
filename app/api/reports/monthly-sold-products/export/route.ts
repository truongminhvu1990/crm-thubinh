import { NextRequest, NextResponse } from "next/server";
import { getAllFilteredRowsForExport } from "@/lib/monthlySoldProducts/monthlySoldProducts.service";
import { MonthlySoldProductsFilters } from "@/types/monthlySoldProducts";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest, requirePermission } from "@/lib/permission/serverAuth";

/** Reporting Permission Enforcement (Decision Q-12, 2026-08-14) - mirrors
 * app/api/sales-ledger/export/route.ts: `reports.export` enforced here, at
 * a real server-side trusted boundary, instead of
 * MonthlySoldProductsSection.tsx's handleExportExcel() calling straight
 * into the browser Supabase client with no permission check in front of
 * it. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.export");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;

  const filters: MonthlySoldProductsFilters = {
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    month: searchParams.get("month") ?? undefined,
    salespersonId: searchParams.get("salespersonId") ?? undefined,
    productCategory: searchParams.get("productCategory") ?? undefined,
    customer: searchParams.get("customer") ?? undefined,
    page: 1,
  };

  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);
  const rows = await getAllFilteredRowsForExport(filters, client, staff);

  return NextResponse.json({ rows });
}
