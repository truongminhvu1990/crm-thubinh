import { NextRequest, NextResponse } from "next/server";
import { getLedgerEntries, createLedgerEntry, MoneyDebtLedgerRuleViolationError } from "@/lib/moneyDebtLedger/moneyDebtLedger.service";
import { CreateMoneyDebtLedgerEntryInput } from "@/types/moneyDebtLedger";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, AdminClientConfigError } from "@/lib/supabase/admin";

/** docs/19_MONEY_DEBT_LEDGER_SPEC.md §25. No PATCH/DELETE anywhere in this
 * route tree — ledger rows are immutable once created (D7); a correction
 * is a new 'Adjustment' row via this same POST, never an edit. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "money_debt_ledger.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const client = await createClient();
  const entries = await getLedgerEntries(
    {
      searchTerm: searchParams.get("search") ?? undefined,
      partyId: searchParams.get("partyId") ?? undefined,
      currency: searchParams.get("currency") ?? undefined,
      transactionType: searchParams.get("transactionType") ?? undefined,
    },
    client
  );
  return NextResponse.json(entries);
}

/** Single-row write path — every transaction_type except 'Buy CNY' (that
 * one goes through /api/money-debt-ledger/buy-cny, since it always
 * produces 2 rows).
 *
 * 2026-08-16 EXECUTE-privilege fix: create_money_debt_ledger_entry() now
 * only grants EXECUTE to `service_role` (neither anon nor authenticated —
 * see supabase/migrations/2026081715_money_debt_ledger_execute_privilege_fix.sql),
 * so this call MUST use the admin client (lib/supabase/admin.ts's
 * createAdminClient(), the project's existing server-only pattern already
 * used by lib/auth/createStaffWithAuth.ts), never the session-bound
 * createClient(). requirePermission() above still runs first and is
 * unchanged — this only changes which client performs the already-
 * authorized write. */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "money_debt_ledger.create");
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json()) as CreateMoneyDebtLedgerEntryInput;
    const client = createAdminClient();
    const entry = await createLedgerEntry(body, auth.staff.id, client);
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof AdminClientConfigError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof MoneyDebtLedgerRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error creating money/debt ledger entry:", error);
    return NextResponse.json({ error: "Không thể ghi nhận giao dịch" }, { status: 500 });
  }
}
