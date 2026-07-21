import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import { toggleSensitiveFieldPairing } from "@/lib/permission/permissionCenter.service";
import { getSensitiveFieldPairings } from "@/lib/permission/permissionCenter.repository";
import { SensitiveFieldKey } from "@/types/permissionCenter";
import { handlePermissionServiceError } from "../_errors";

/** Sensitive Field Config and Role Detail's derived "can see" summary
 * (PERMISSION_UI.md §6, §3) - protected per Decision 19. */
export async function GET(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const pairings = await getSensitiveFieldPairings();
    return NextResponse.json(pairings);
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}

/** Sensitive Field Config (PERMISSION_UI.md §6) - the one editor for
 * permission_sensitive_fields. */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { permission_key, field_key, pair } = body as {
      permission_key: string;
      field_key: SensitiveFieldKey;
      pair: boolean;
    };
    if (!permission_key || !field_key || typeof pair !== "boolean") {
      return NextResponse.json({ error: "permission_key, field_key, pair là bắt buộc" }, { status: 400 });
    }
    await toggleSensitiveFieldPairing(auth.staff.id, permission_key, field_key, pair);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handlePermissionServiceError(error);
  }
}
