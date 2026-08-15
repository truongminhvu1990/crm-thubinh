import { NextRequest, NextResponse } from "next/server";
import { getColumnPreference, saveColumnPreference } from "@/lib/reportPreferences/reportPreferences.repository";
import { ReportKey } from "@/types/reportPreferences";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";

const VALID_REPORT_KEYS: ReportKey[] = ["sales_ledger", "monthly_sold_products"];

function isValidReportKey(value: string | null): value is ReportKey {
  return !!value && (VALID_REPORT_KEYS as string[]).includes(value);
}

/** Per-User Report Column Preferences (Product Owner task, 2026-08-14).
 * `staff_id` is always the CALLER's own — resolved server-side via
 * getCurrentStaffFromRequest (Server Authentication Context, the same
 * mechanism Orders/Permission Center/Sales Ledger already use), never
 * accepted from the request body/query. There is no cross-user read/write
 * path through this route. */
export async function GET(request: NextRequest) {
  const reportKey = request.nextUrl.searchParams.get("reportKey");
  if (!isValidReportKey(reportKey)) {
    return NextResponse.json({ error: "Invalid or missing reportKey" }, { status: 400 });
  }

  const staff = await getCurrentStaffFromRequest(request);
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await createClient();
  const preference = await getColumnPreference(staff.id!, reportKey, client);
  return NextResponse.json({ preference });
}

export async function PUT(request: NextRequest) {
  const staff = await getCurrentStaffFromRequest(request);
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const reportKey = body?.reportKey ?? null;
  if (!isValidReportKey(reportKey)) {
    return NextResponse.json({ error: "Invalid or missing reportKey" }, { status: 400 });
  }
  if (!Array.isArray(body?.visibleColumns) || !body.visibleColumns.every((c: unknown) => typeof c === "string")) {
    return NextResponse.json({ error: "visibleColumns must be a string array" }, { status: 400 });
  }

  const client = await createClient();
  try {
    const preference = await saveColumnPreference(staff.id!, reportKey, body.visibleColumns, client);
    return NextResponse.json({ preference });
  } catch {
    return NextResponse.json({ error: "Failed to save preference" }, { status: 500 });
  }
}
