import { NextRequest, NextResponse } from "next/server";
import { getSalesLedgerPage, getSalesLedgerSummary } from "@/lib/salesLedger/salesLedger.service";
import { EntrySource, SalesLedgerFilters, SalesLedgerSortField, SortDirection } from "@/types/salesLedger";
import { CommissionStatus } from "@/types/commission";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";

/** Backend API Foundation (Package 4C, Wave 3) - Sales Ledger's server-side
 * read endpoint. Reuses getSalesLedgerPage()/getSalesLedgerSummary()
 * unchanged (same filters, same product-image enrichment, same Data Scope
 * call inside the repository) with a server Supabase client instead of the
 * browser one. Bundles rows+totalCount+summary into one response because
 * the List page already fetches both together (Promise.all) for the exact
 * same filters - not a new business rule, just the existing orchestration
 * moved server-side.
 *
 * Hotfix 3A - "current staff" for the repository's Data Scope call is now
 * resolved via getCurrentStaffFromRequest (Server Authentication Context,
 * the same request-cookie-based resolver Orders/Permission Center already
 * use), not the repository's own default (Browser Authentication Context,
 * a no-op in a Route Handler - see Wave 3's Cross-module Dependency Audit).
 * Nothing about Permission/Data Scope/query/filtering logic changed - only
 * how "who is calling" gets identified. */
export async function GET(request: NextRequest) {
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
    page: Number(searchParams.get("page") ?? "1"),
  };

  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);
  const [page, summary] = await Promise.all([
    getSalesLedgerPage(filters, client, staff),
    getSalesLedgerSummary(filters, client, staff),
  ]);

  return NextResponse.json({ ...page, summary });
}
