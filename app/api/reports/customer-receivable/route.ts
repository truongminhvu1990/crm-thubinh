import { NextRequest, NextResponse } from "next/server";
import { getCustomerReceivablePage } from "@/lib/customerReceivable/customerReceivable.service";
import { CustomerReceivableFilters } from "@/types/customerReceivable";
import { FinancialSettlementState } from "@/lib/orders/order.rules";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest, requirePermission } from "@/lib/permission/serverAuth";

const VALID_STATUS: FinancialSettlementState[] = ["Outstanding", "Settled", "Overpaid"];

/** Customer Receivable (Finance Project #1, Phase E) - server-side read
 * endpoint, mirrors app/api/reports/payment-method's own shape (server
 * Supabase client, Server Authentication Context for the Data Scope call
 * inside the repository). Gated by reports.view alone, same permission
 * every other report in this codebase already uses - no new permission
 * key. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const statusParam = searchParams.get("status");

  const filters: CustomerReceivableFilters = {
    searchTerm: searchParams.get("searchTerm") ?? undefined,
    status: statusParam && VALID_STATUS.includes(statusParam as FinancialSettlementState) ? (statusParam as FinancialSettlementState) : undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    page: Number(searchParams.get("page")) || 1,
  };

  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);
  const result = await getCustomerReceivablePage(filters, client, staff);

  return NextResponse.json(result);
}
