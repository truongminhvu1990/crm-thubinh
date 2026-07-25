import { createAdminClient, AdminClientConfigError } from "@/lib/supabase/admin";
import { generateTempPassword } from "./generateTempPassword";
import { getStaffByEmail } from "@/lib/staff.service";
import { Staff, StaffRole } from "@/types/staff";

export type CreateStaffWithAuthErrorCode =
  | "EMAIL_REQUIRED"
  | "EMAIL_DUPLICATE"
  | "STAFF_CODE_DUPLICATE"
  | "AUTH_CREATE_FAILED"
  | "STAFF_CREATE_FAILED"
  | "CONFIG_MISSING";

export class CreateStaffWithAuthError extends Error {
  code: CreateStaffWithAuthErrorCode;
  constructor(code: CreateStaffWithAuthErrorCode, message: string) {
    super(message);
    this.name = "CreateStaffWithAuthError";
    this.code = code;
  }
}

export interface CreateStaffWithAuthInput {
  staff_code: string;
  full_name: string;
  phone?: string | null;
  email: string;
  role: StaffRole;
  joined_date?: string | null;
  avatar?: string | null;
  note?: string | null;
}

export interface CreateStaffWithAuthResult {
  staff: Staff;
  temporaryPassword: string;
}

/** Staff Identity & Authentication Foundation - the ONLY path allowed to
 * create a staff member (Business Rule 3: never from the Supabase
 * Dashboard). Implements the locked workflow (Business Rule 2):
 *
 *   Create Auth User -> receive auth_user_id -> Create Staff -> commit
 *   Any step fails -> rollback.
 *
 * `auth_user_id` is the only identity going forward (Rule 1); email is
 * captured on the Auth user purely so the owner can log in with it. The
 * caller (app/api/staff/route.ts) is responsible for authenticating the
 * requester as an Owner before calling this - this function itself performs
 * no permission check. */
export async function createStaffWithAuth(
  input: CreateStaffWithAuthInput
): Promise<CreateStaffWithAuthResult> {
  const email = input.email?.trim();
  if (!email) {
    throw new CreateStaffWithAuthError("EMAIL_REQUIRED", "Email là bắt buộc");
  }

  // Application-level duplicate check (Implementation item 8), ahead of the
  // Auth call so an obviously-duplicate request never creates an orphaned
  // Auth user in the first place. staff_email_unique (DB layer) and
  // auth.admin.createUser's own rejection (below) are the backstops this
  // doesn't fully replace.
  const existingStaff = await getStaffByEmail(email);
  if (existingStaff) {
    throw new CreateStaffWithAuthError("EMAIL_DUPLICATE", "Email đã tồn tại");
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    if (error instanceof AdminClientConfigError) {
      throw new CreateStaffWithAuthError("CONFIG_MISSING", error.message);
    }
    throw error;
  }

  const temporaryPassword = generateTempPassword();

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  });

  if (authError || !authUser?.user) {
    const isDuplicate = (authError?.message || "").toLowerCase().includes("already");
    throw new CreateStaffWithAuthError(
      isDuplicate ? "EMAIL_DUPLICATE" : "AUTH_CREATE_FAILED",
      isDuplicate ? "Email đã tồn tại" : authError?.message || "Không thể tạo tài khoản đăng nhập"
    );
  }

  const authUserId = authUser.user.id;

  const { data: staff, error: staffError } = await admin
    .from("staff")
    .insert({
      staff_code: input.staff_code,
      full_name: input.full_name,
      phone: input.phone ?? null,
      email,
      role: input.role,
      status: "Active",
      joined_date: input.joined_date ?? null,
      avatar: input.avatar ?? null,
      note: input.note ?? null,
      auth_user_id: authUserId,
      // Required Change 4 (Force Password Change foundation) - every new
      // account starts on the Business Rule 4/5 temporary password, so it
      // always needs changing on first login. Nothing in this package
      // reads/clears this flag yet - that's the future login-flow work.
      must_change_password: true,
    })
    .select()
    .single();

  if (staffError || !staff) {
    // Rollback (Implementation item 7): Auth succeeded, Staff failed -> the
    // Auth user must not be left orphaned.
    const { error: rollbackError } = await admin.auth.admin.deleteUser(authUserId);
    if (rollbackError) {
      console.error(
        `CreateStaffWithAuth: rollback failed - auth user ${authUserId} is now orphaned and needs manual cleanup`,
        rollbackError
      );
    }

    const message = staffError?.message || "";
    const code: CreateStaffWithAuthErrorCode = message.includes("staff_code")
      ? "STAFF_CODE_DUPLICATE"
      : message.includes("email")
        ? "EMAIL_DUPLICATE"
        : "STAFF_CREATE_FAILED";
    const displayMessage =
      code === "STAFF_CODE_DUPLICATE"
        ? "Mã nhân viên đã tồn tại"
        : code === "EMAIL_DUPLICATE"
          ? "Email đã tồn tại"
          : "Không thể tạo hồ sơ nhân viên";
    throw new CreateStaffWithAuthError(code, displayMessage);
  }

  // Best-effort, same "log, don't throw" convention as
  // lib/activityLog.service.ts logActivity - via the admin client since this
  // runs server-side with no browser session for the anon-key client to
  // attach.
  const { error: logError } = await admin
    .from("activity_logs")
    .insert({ staff_id: staff.id, action: "created", entity: "staff", entity_id: staff.id });
  if (logError) {
    console.error("CreateStaffWithAuth: error logging activity:", logError);
  }

  return { staff: staff as Staff, temporaryPassword };
}
