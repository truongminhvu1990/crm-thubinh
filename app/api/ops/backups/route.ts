import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { getBackupConfirmationLog, logBackupConfirmation } from "@/lib/opsConsole/opsConsole.service";
import { handleOpsError } from "../_errors";

/** Backup Status (PRODUCTION_READINESS_UI.md §4, DB §6). Decision 27:
 * operational metadata only - this endpoint's own shape (environment,
 * plan tier, PITR flag, retention days, notes) never accepts or stores
 * business/customer data, by construction (no such field exists to send). */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const logs = await getBackupConfirmationLog();
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
    const { environment, plan_tier, pitr_enabled, retention_days, notes } = body as {
      environment: string;
      plan_tier: string;
      pitr_enabled: boolean;
      retention_days?: number;
      notes?: string;
    };
    if (!environment || !plan_tier) {
      return NextResponse.json({ error: "environment, plan_tier là bắt buộc" }, { status: 400 });
    }
    await logBackupConfirmation(auth.staff.id, {
      environment,
      planTier: plan_tier,
      pitrEnabled: !!pitr_enabled,
      retentionDays: retention_days,
      notes,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleOpsError(error);
  }
}
