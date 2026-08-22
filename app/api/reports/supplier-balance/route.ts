import { NextRequest, NextResponse } from "next/server";
import { getSupplierBalancePage } from "@/lib/supplierBalance/supplierBalance.service";
import { SupplierBalanceFilters } from "@/types/supplierBalance";
import { MoneyDebtLedgerCurrency } from "@/types/moneyDebtLedger";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/permission/serverAuth";

const VALID_CURRENCIES: MoneyDebtLedgerCurrency[] = ["VND", "CNY"];

/** Supplier Balance (Finance Project #1, Phase F re-scope, Product Owner
 * Approval 2026-08-21) - gated by `money_debt_ledger.view`, the SAME
 * permission every other Money Debt Ledger read endpoint already uses
 * (e.g. /api/money-debt-ledger/balance), not `reports.view` - this report
 * reads money_debt_ledger_entries, a resource that already has its own
 * established permission, so this matches the existing pattern for THIS
 * data source rather than the unrelated Orders/Payments reporting
 * permission. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "money_debt_ledger.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const currencyParam = searchParams.get("currency");

  const filters: SupplierBalanceFilters = {
    searchTerm: searchParams.get("searchTerm") ?? undefined,
    currency: currencyParam && VALID_CURRENCIES.includes(currencyParam as MoneyDebtLedgerCurrency) ? (currencyParam as MoneyDebtLedgerCurrency) : undefined,
  };

  const client = await createClient();
  const result = await getSupplierBalancePage(filters, client);

  return NextResponse.json(result);
}
