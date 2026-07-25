import { Staff, StaffRole } from "@/types/staff";
import { CreateStaffWithAuthErrorCode } from "./createStaffWithAuth";

export interface CreateStaffWithAuthApiError {
  code: CreateStaffWithAuthErrorCode | "UNKNOWN";
  message: string;
}

export interface CreateStaffWithAuthApiInput {
  staff_code: string;
  full_name: string;
  phone?: string | null;
  email: string;
  role: StaffRole;
  joined_date?: string | null;
  avatar?: string | null;
  note?: string | null;
}

/** Client-side call to POST /api/staff (Staff Identity & Authentication
 * Foundation) - the only allowed way to create a staff member now (Business
 * Rule 3: never from the Supabase Dashboard). Returns the same {data,
 * error} shape lib/staff.service.ts's addStaff() already used, so
 * app/settings/staff/page.tsx's existing error-code handling keeps working
 * with the new codes (STAFF_CODE_DUPLICATE, AUTH_CREATE_FAILED,
 * STAFF_CREATE_FAILED, CONFIG_MISSING) added alongside the old ones. */
export async function createStaffWithAuthApi(
  input: CreateStaffWithAuthApiInput
): Promise<{
  data: { staff: Staff; temporaryPassword: string } | null;
  error: CreateStaffWithAuthApiError | null;
}> {
  const res = await fetch("/api/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      data: null,
      error: { code: json.code || "UNKNOWN", message: json.error || `Yêu cầu thất bại (${res.status})` },
    };
  }
  return { data: json, error: null };
}
