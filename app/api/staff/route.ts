import { NextRequest, NextResponse } from "next/server";
import { requirePermissionCenterAccess } from "@/lib/permission/serverAuth";
import {
  createStaffWithAuth,
  CreateStaffWithAuthError,
  CreateStaffWithAuthErrorCode,
} from "@/lib/auth/createStaffWithAuth";
import { StaffRole } from "@/types/staff";

const VALID_ROLES: StaffRole[] = ["Owner", "Manager", "Sales", "Marketing", "Viewer"];

const ERROR_STATUS: Record<CreateStaffWithAuthErrorCode, number> = {
  EMAIL_REQUIRED: 400,
  EMAIL_DUPLICATE: 409,
  STAFF_CODE_DUPLICATE: 409,
  AUTH_CREATE_FAILED: 500,
  STAFF_CREATE_FAILED: 500,
  CONFIG_MISSING: 503,
};

/** Staff Identity & Authentication Foundation - the only endpoint allowed to
 * create a staff member (Business Rule 3). Gated the same way as every
 * other Owner-only write in this codebase (Permission Center's
 * requirePermissionCenterAccess / settings.manage) - reusing that existing
 * enforcement is not "implementing Permission Center," it's the same
 * precedent already used by app/api/staff/[id]/permission-assignment. */
export async function POST(request: NextRequest) {
  const auth = await requirePermissionCenterAccess(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();

  if (!body.staff_code?.trim()) {
    return NextResponse.json({ error: "Mã nhân viên là bắt buộc" }, { status: 400 });
  }
  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: "Họ tên là bắt buộc" }, { status: 400 });
  }
  if (!body.email?.trim()) {
    return NextResponse.json({ error: "Email là bắt buộc" }, { status: 400 });
  }
  const role = VALID_ROLES.includes(body.role) ? (body.role as StaffRole) : "Sales";

  try {
    const { staff, temporaryPassword } = await createStaffWithAuth({
      staff_code: body.staff_code.trim(),
      full_name: body.full_name.trim(),
      phone: body.phone?.trim() || null,
      email: body.email.trim(),
      role,
      joined_date: body.joined_date || null,
      avatar: body.avatar || null,
      note: body.note?.trim() || null,
    });

    return NextResponse.json({ staff, temporaryPassword }, { status: 201 });
  } catch (error) {
    if (error instanceof CreateStaffWithAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: ERROR_STATUS[error.code] }
      );
    }
    console.error("Unexpected error creating staff:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
