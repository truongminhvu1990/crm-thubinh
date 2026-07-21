import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { getRestoreDrillLog, logRestoreDrill } from "@/lib/opsConsole/opsConsole.service";
import { handleOpsError } from "../_errors";

/** Restore History (PRODUCTION_READINESS_UI.md §5, DB §7, Decision 28) -
 * exactly the 6 locked minimum fields (Timestamp/Operator/Backup
 * reference/Restore duration/Result/Notes) - Timestamp is created_at,
 * Operator is the authenticated actor, the rest are the request body.
 * Desktop-only in the UI (Decision 35). */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const logs = await getRestoreDrillLog();
    return NextResponse.json(logs);
  } catch (error) {
    return handleOpsError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { environment, backup_reference, restore_duration, result, notes } = body as {
      environment: string;
      backup_reference: string;
      restore_duration: string;
      result: "success" | "failure";
      notes?: string;
    };
    if (!environment || !backup_reference || !restore_duration || !result) {
      return NextResponse.json(
        { error: "environment, backup_reference, restore_duration, result là bắt buộc" },
        { status: 400 }
      );
    }
    await logRestoreDrill(auth.staff.id, {
      environment,
      backupReference: backup_reference,
      restoreDuration: restore_duration,
      result,
      notes,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleOpsError(error);
  }
}
