import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getExecutionAccounts, createExecutionAccount } from "@/lib/seeding/seedingExecutionAccount.service";
import { handleSeedingError } from "../_errors";

/** Phase 2K-E — a real Facebook identity staff may manually operate.
 * Managing this list is a planning/resource-management action, the same
 * seeding.manage permission every other campaign/target/task-creation
 * route already uses — no new permission introduced. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  try {
    const client = await createClient();
    const accounts = await getExecutionAccounts(client);
    return NextResponse.json(accounts);
  } catch (error) {
    return handleSeedingError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  try {
    const input = await request.json();
    const client = await createClient();
    const account = await createExecutionAccount(input, auth.staff.id, client);
    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    return handleSeedingError(error);
  }
}
