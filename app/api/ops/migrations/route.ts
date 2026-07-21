import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { getMigrationVerificationLog, logMigrationVerification } from "@/lib/opsConsole/opsConsole.service";
import { handleOpsError } from "../_errors";

/** Migration History / Migration Verification Checklist
 * (PRODUCTION_READINESS_UI.md §6, DB §3.1, Decision 30) - desktop-only in
 * the UI (Decision 35). */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const logs = await getMigrationVerificationLog();
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
    const { environment, migration_file, completed, record_counts, constraints, app_startup, notes } = body as {
      environment: string;
      migration_file: string;
      completed: boolean;
      record_counts: boolean;
      constraints: boolean;
      app_startup: boolean;
      notes?: string;
    };
    if (!environment || !migration_file) {
      return NextResponse.json({ error: "environment, migration_file là bắt buộc" }, { status: 400 });
    }
    await logMigrationVerification(auth.staff.id, {
      environment,
      migrationFile: migration_file,
      completed: !!completed,
      recordCounts: !!record_counts,
      constraints: !!constraints,
      appStartup: !!app_startup,
      notes,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleOpsError(error);
  }
}
