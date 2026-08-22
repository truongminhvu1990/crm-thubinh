import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { SupplierBalanceFilters, SupplierBalanceRow } from "@/types/supplierBalance";
import { MoneyDebtLedgerCurrency } from "@/types/moneyDebtLedger";

/** Raw data access only, against `money_debt_ledger_entries` (joined to
 * `partners`) directly — Reporting reads this table directly
 * (docs/07_REPORTING_SPEC.md §3), same pattern every other Finance
 * Project #1 reporting repository already uses. No
 * lib/moneyDebtLedger/moneyDebtLedger.service.ts function is imported
 * here — that module owns writes and the general (Money Changer +
 * Supplier) balance/entry views; this module only reads, filtered to
 * `party_type='Supplier'`, and adds `lastTransactionDate`, which
 * getAllBalances() doesn't compute.
 *
 * No Data Scope call — deliberately. Data Scope everywhere else in this
 * codebase (Payment Method Report, Customer Receivable) is keyed to
 * `orders.sales_owner`, a per-salesperson revenue-attribution dimension
 * that simply does not exist on `money_debt_ledger_entries`
 * (confirmed: getLedgerEntries in moneyDebtLedger.service.ts has never
 * applied Data Scope either — every existing Money Debt Ledger read is
 * gated by permission alone, `money_debt_ledger.view`). Applying Data
 * Scope here would mean inventing a scoping dimension this data doesn't
 * have — "consistent with other financial reports" means matching each
 * report's own actual source data, not force-fitting an unrelated
 * dimension. */
interface PartnerRelation {
  id: string;
  name: string;
  partner_code: string;
}

interface LedgerRow {
  party_id: string;
  currency: MoneyDebtLedgerCurrency;
  amount: number;
  direction: "IN" | "OUT";
  transaction_date: string;
  party: PartnerRelation | PartnerRelation[] | null;
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/** Every (Supplier, currency) balance with at least one ledger row —
 * Σ IN − Σ OUT, the exact formula getAllBalances() already uses, plus
 * lastTransactionDate/transactionCount (this report's own additions, not
 * present on the general Balance shape). `staff`/Data Scope are
 * deliberately absent from this signature — see this file's own header
 * comment for why. */
export async function findSupplierBalances(
  filters: SupplierBalanceFilters,
  client: SupabaseClient = supabase
): Promise<SupplierBalanceRow[]> {
  let query = client
    .from("money_debt_ledger_entries")
    .select("party_id, currency, amount, direction, transaction_date, party:partners(id, name, partner_code)")
    .eq("party_type", "Supplier");
  if (filters.currency) query = query.eq("currency", filters.currency);

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching Supplier ledger entries for Supplier Balance report:", error);
    return [];
  }

  const groups = new Map<string, SupplierBalanceRow>();
  for (const row of (data ?? []) as unknown as LedgerRow[]) {
    const party = firstOf(row.party);
    const key = `${row.party_id}::${row.currency}`;
    const group =
      groups.get(key) ??
      ({
        partyId: row.party_id,
        supplierName: party?.name ?? "",
        supplierCode: party?.partner_code ?? "",
        currency: row.currency,
        totalIn: 0,
        totalOut: 0,
        balance: 0,
        lastTransactionDate: null,
        transactionCount: 0,
      } satisfies SupplierBalanceRow);

    if (row.direction === "IN") group.totalIn += Number(row.amount) || 0;
    else group.totalOut += Number(row.amount) || 0;
    group.balance = group.totalIn - group.totalOut;
    group.transactionCount += 1;
    if (!group.lastTransactionDate || row.transaction_date > group.lastTransactionDate) {
      group.lastTransactionDate = row.transaction_date;
    }

    groups.set(key, group);
  }

  let rows = [...groups.values()];

  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    rows = rows.filter((r) => r.supplierName.toLowerCase().includes(term) || r.supplierCode.toLowerCase().includes(term));
  }

  return rows.sort((a, b) => a.supplierName.localeCompare(b.supplierName, "vi") || a.currency.localeCompare(b.currency));
}
