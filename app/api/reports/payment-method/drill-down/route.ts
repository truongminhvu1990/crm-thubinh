import { NextRequest, NextResponse } from "next/server";
import { getPaymentMethodDrillDown } from "@/lib/paymentMethodReport/paymentMethodReport.service";
import { PaymentMethodReportFilters } from "@/types/paymentMethodReport";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest, requirePermission } from "@/lib/permission/serverAuth";

/** Payment Method Report drill-down (Product Owner task, 2026-08-14) —
 * separate sub-route mirroring app/api/reports/monthly-sold-products/export's
 * own "own route per distinct data need" shape, rather than overloading the
 * summary route above. Same reports.view gate as the summary (this is still
 * a read of the same underlying revenue data, just at a finer grain) and the
 * same filters, plus the specific payment method being drilled into. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const paymentMethod = searchParams.get("paymentMethod");
  if (!paymentMethod) {
    return NextResponse.json({ error: "paymentMethod is required" }, { status: 400 });
  }

  const filters: PaymentMethodReportFilters = {
    month: searchParams.get("month") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    salesperson: searchParams.get("salesperson") ?? undefined,
  };

  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);
  const rows = await getPaymentMethodDrillDown(filters, paymentMethod, client, staff);

  return NextResponse.json({ rows });
}
