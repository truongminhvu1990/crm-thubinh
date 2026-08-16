import { NextRequest, NextResponse } from "next/server";
import {
  getReceivingAccountById,
  updateReceivingAccount,
  setReceivingAccountActive,
  ReceivingAccountRuleViolationError,
} from "@/lib/receivingAccount.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "partner.view");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const client = await createClient();
  const account = await getReceivingAccountById(id, client);
  if (!account) return NextResponse.json({ error: "Không tìm thấy tài khoản nhận tiền" }, { status: 404 });
  return NextResponse.json(account);
}

/** No DELETE route exists (approved design) — deactivation is `is_active`
 * in the same PATCH body, routed to setReceivingAccountActive rather than
 * a generic field update, matching this service's own explicit separation
 * (updateReceivingAccount deliberately excludes is_active). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "partner.update");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const body = await request.json();
    const client = await createClient();

    if (typeof body.is_active === "boolean") {
      const account = await setReceivingAccountActive(id, body.is_active, auth.staff.id, client);
      return NextResponse.json(account);
    }

    const account = await updateReceivingAccount(id, body, auth.staff.id, client);
    return NextResponse.json(account);
  } catch (error) {
    if (error instanceof ReceivingAccountRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error updating receiving account:", error);
    return NextResponse.json({ error: "Không thể cập nhật tài khoản nhận tiền" }, { status: 500 });
  }
}
