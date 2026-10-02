import { NextRequest, NextResponse } from "next/server";
import { getSoldDetail } from "@/lib/monthlySoldProducts/monthlySoldProducts.service";
import { MonthlySoldProductsFilters } from "@/types/monthlySoldProducts";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { parseOverviewRange } from "../_params";

/** Overview drill-down: "Đã bán". The LOCKED Sold population (Completed, or
 * Reserved with >= 1 real payment record; plus BR-002 legacy entries) by
 * `order_date`. `view=orders` (default) returns one row per sold order,
 * `view=products` one row per sold product line; both come from the same
 * population and `totals.soldValue` is identical for either. `start`/`end`
 * match the Dashboard; salespersonId / productCategory / customer are the
 * Sold report's own optional filters. Gross profit stays Owner/Manager-only. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const parsed = parseOverviewRange(searchParams);
  if ("error" in parsed) return parsed.error;

  const view = searchParams.get("view") ?? "orders";
  if (view !== "orders" && view !== "products") {
    return NextResponse.json({ error: "view must be 'orders' or 'products'" }, { status: 400 });
  }

  const filters: MonthlySoldProductsFilters = {
    page: 1,
    dateFrom: parsed.range?.start,
    dateTo: parsed.range?.end,
    salespersonId: searchParams.get("salespersonId") ?? undefined,
    productCategory: searchParams.get("productCategory") ?? undefined,
    customer: searchParams.get("customer") ?? undefined,
  };

  const client = await createClient();
  const { totals, orders, products } = await getSoldDetail(filters, client, auth.staff);

  return NextResponse.json({
    metric: "sold",
    range: parsed.range,
    view,
    totals,
    total: totals.soldValue,
    count: view === "orders" ? orders.length : products.length,
    rows: view === "orders" ? orders : products,
  });
}
