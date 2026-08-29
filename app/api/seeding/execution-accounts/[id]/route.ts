import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getExecutionAccountById, updateExecutionAccount } from "@/lib/seeding/seedingExecutionAccount.service";
import { handleSeedingError } from "../../_errors";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    const account = await getExecutionAccountById(id, client);
    if (!account) return NextResponse.json({ error: "Execution account not found" }, { status: 404 });
    return NextResponse.json(account);
  } catch (error) {
    return handleSeedingError(error);
  }
}

/** Update — including deactivate (status -> "Inactive"). No delete
 * route: accounts are meant to be deactivated, never deleted, so
 * historical tasks always keep a resolvable execution_account_id. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const client = await createClient();
    const account = await updateExecutionAccount(id, body, auth.staff.id, client);
    return NextResponse.json(account);
  } catch (error) {
    return handleSeedingError(error);
  }
}
