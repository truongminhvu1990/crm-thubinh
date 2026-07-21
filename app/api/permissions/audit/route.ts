import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { supabase } from "@/lib/supabase";
import { handlePermissionServiceError } from "../_errors";

const ENTITIES = ["role", "permission", "role_permission", "role_data_scope"];

/** Audit History (PERMISSION_UI.md §9) - protected per Decision 19.
 * Query params: entity (one of ENTITIES), from, to (yyyy-mm-dd). */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const entity = searchParams.get("entity");
    const from = searchParams.get("from") || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const to = searchParams.get("to") || new Date().toISOString().slice(0, 10);

    const query = supabase
      .from("activity_logs")
      .select("*, staff:staff(full_name, staff_code)")
      .in("entity", entity ? [entity] : ENTITIES)
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(200);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}
