import { NextRequest, NextResponse } from "next/server";
import { getReceivingAccounts, createReceivingAccount, ReceivingAccountRuleViolationError } from "@/lib/receivingAccount.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Payment / Bank Account / Money-Debt domain redesign, Stage 3.
 * Receiving Account management reuses the existing partner.view/
 * partner.create permissions rather than introducing new keys (approved
 * design, Stage 2 audit §O) — the owner of a receiving account is always
 * an existing partners row, and this is the same governance boundary
 * Partner Center itself already enforces. No DELETE route exists here —
 * see the [id] route's PATCH-only shape. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "partner.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const client = await createClient();
  const accounts = await getReceivingAccounts(
    {
      ownerPartnerId: searchParams.get("ownerPartnerId") ?? undefined,
      bankId: searchParams.get("bankId") ?? undefined,
      includeInactive: searchParams.get("includeInactive") === "true",
    },
    client
  );
  return NextResponse.json(accounts);
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "partner.create");
  if ("error" in auth) return auth.error;

  try {
    const input = await request.json();
    const client = await createClient();
    const account = await createReceivingAccount(input, auth.staff.id, client);
    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    if (error instanceof ReceivingAccountRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error creating receiving account:", error);
    return NextResponse.json({ error: "Không thể tạo tài khoản nhận tiền" }, { status: 500 });
  }
}
