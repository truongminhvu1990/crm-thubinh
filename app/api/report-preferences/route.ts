import { NextRequest, NextResponse } from "next/server";
import { deleteColumnPreference, getColumnPreference, saveColumnPreference } from "@/lib/reportPreferences/reportPreferences.repository";
import { MAX_BODY_BYTES, validatePutPayload } from "@/lib/reportPreferences/validatePreferencePayload";
import { isReportKey } from "@/lib/reportColumns/registry";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";

/** Per-User Report Column Preferences (Product Owner task, 2026-08-14; hardened in Phase 1.6 Wave B0).
 * `staff_id` is always the CALLER's own - resolved server-side via getCurrentStaffFromRequest (Server Authentication
 * Context), never accepted from the request body/query. Row ownership is ALSO enforced by RLS in the database
 * (migration 2026100403), so this route is not the only line of defence. The whitelist of report keys and column
 * keys comes from lib/reportColumns/registry.ts. */
const err = (status: number, code: string, error: string, extra?: object) =>
  NextResponse.json({ error, code, ...extra }, { status });

export async function GET(request: NextRequest) {
  const reportKey = request.nextUrl.searchParams.get("reportKey");
  if (!isReportKey(reportKey)) return err(400, "INVALID_REPORT_KEY", "Invalid or missing reportKey");

  const staff = await getCurrentStaffFromRequest(request);
  if (!staff) return err(401, "UNAUTHORIZED", "Unauthorized");

  const client = await createClient();
  const preference = await getColumnPreference(staff.id!, reportKey, client);
  return NextResponse.json({ preference });
}

export async function PUT(request: NextRequest) {
  const staff = await getCurrentStaffFromRequest(request);
  if (!staff) return err(401, "UNAUTHORIZED", "Unauthorized");

  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return err(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return err(413, "PAYLOAD_TOO_LARGE", "Payload too large");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return err(400, "INVALID_PAYLOAD", "Body must be valid JSON");
  }

  const v = validatePutPayload(body);
  if (!v.ok) return err(v.status, v.code, v.error, v.keys ? { keys: v.keys } : undefined);

  const client = await createClient();
  try {
    const preference = await saveColumnPreference(staff.id!, v.reportKey, v.visibleColumns, client, v.columnOrder ?? null);
    return NextResponse.json({ preference });
  } catch {
    return err(500, "SAVE_FAILED", "Failed to save preference");
  }
}

/** Reset: deletes the caller's own row. Idempotent. */
export async function DELETE(request: NextRequest) {
  const reportKey = request.nextUrl.searchParams.get("reportKey");
  if (!isReportKey(reportKey)) return err(400, "INVALID_REPORT_KEY", "Invalid or missing reportKey");

  const staff = await getCurrentStaffFromRequest(request);
  if (!staff) return err(401, "UNAUTHORIZED", "Unauthorized");

  const client = await createClient();
  try {
    await deleteColumnPreference(staff.id!, reportKey, client);
    return NextResponse.json({ preference: null });
  } catch {
    return err(500, "DELETE_FAILED", "Failed to reset preference");
  }
}
