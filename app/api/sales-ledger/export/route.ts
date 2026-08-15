import { NextRequest, NextResponse } from "next/server";
import { getAllFilteredRowsForExport } from "@/lib/salesLedger/salesLedger.service";
import { EntrySource, SalesLedgerFilters, SalesLedgerSortField, SortDirection } from "@/types/salesLedger";
import { CommissionStatus } from "@/types/commission";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest, requirePermission } from "@/lib/permission/serverAuth";

/** Reporting Permission Enforcement (Decision Q-12, 2026-08-14) - `reports.
 * export` is checked here, not just `reports.view` on the on-screen list
 * endpoint, because Excel export is a materially different capability
 * (an unbounded, unpaginated data pull) - the page's own Export button
 * previously called straight into the browser Supabase client
 * (getAllFilteredRowsForExport with no client/staff, see git history),
 * which had no permission check in front of it at all (RLS on sales_ledger
 * is a blanket "Allow full access" for authenticated - see reportsBI.
 * service.ts's own header comment on this schema's RLS shape). This route
 * is the new, real trusted boundary; the page's handleExport() now fetches
 * from here instead of calling the repository directly. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.export");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;

  const filters: SalesLedgerFilters = {
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    customer: searchParams.get("customer") ?? undefined,
    salespersonId: searchParams.get("salespersonId") ?? undefined,
    productCode: searchParams.get("productCode") ?? undefined,
    productName: searchParams.get("productName") ?? undefined,
    productCategory: searchParams.get("productCategory") ?? undefined,
    minAmount: searchParams.has("minAmount") ? Number(searchParams.get("minAmount")) : undefined,
    maxAmount: searchParams.has("maxAmount") ? Number(searchParams.get("maxAmount")) : undefined,
    commissionStatus: (searchParams.get("commissionStatus") as CommissionStatus | null) ?? undefined,
    entrySource: (searchParams.get("entrySource") as EntrySource | null) ?? undefined,
    createdBy: searchParams.get("createdBy") ?? undefined,
    updatedBy: searchParams.get("updatedBy") ?? undefined,
    duplicateOnly: searchParams.get("duplicateOnly") === "true" ? true : undefined,
    sortField: (searchParams.get("sortField") as SalesLedgerSortField | null) ?? "sale_date",
    sortDirection: (searchParams.get("sortDirection") as SortDirection | null) ?? "desc",
    page: 1,
  };

  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);
  const rows = await getAllFilteredRowsForExport(filters, client, staff);

  return NextResponse.json({ rows });
}
