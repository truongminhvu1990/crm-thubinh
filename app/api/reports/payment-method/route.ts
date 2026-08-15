import { NextRequest, NextResponse } from "next/server";
import { getPaymentMethodReport, getPaymentMethodOptions } from "@/lib/paymentMethodReport/paymentMethodReport.service";
import { PaymentMethodReportFilters } from "@/types/paymentMethodReport";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest, requirePermission } from "@/lib/permission/serverAuth";

/** Payment Method Report (docs/07_REPORTING_SPEC.md §10, Operational
 * Reporting) — server-side read endpoint, mirrors app/api/sales-ledger's
 * shape (server Supabase client, Server Authentication Context for the Data
 * Scope call inside the repository). Bundles rows + the distinct-method
 * option list (for the Payment Method filter's own dropdown) in one
 * response, matching Sales Ledger/Monthly Sold Products' "bundle what the
 * page needs together" convention rather than a second round trip. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;

  const filters: PaymentMethodReportFilters = {
    month: searchParams.get("month") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    salesperson: searchParams.get("salesperson") ?? undefined,
    paymentMethod: searchParams.get("paymentMethod") ?? undefined,
  };

  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);
  const [rows, paymentMethodOptions] = await Promise.all([
    getPaymentMethodReport(filters, client, staff),
    getPaymentMethodOptions(client),
  ]);

  return NextResponse.json({ rows, paymentMethodOptions });
}
