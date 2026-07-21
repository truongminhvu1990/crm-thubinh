import { supabase } from "@/lib/supabase";
import { VerificationDashboardData } from "@/types/verification";

// Data Verification Center (Sprint v2.3.0). This is the only new query this
// module adds - the transaction table itself (Feature 1-4/7) reuses
// lib/salesLedger/salesLedger.service.ts entirely (getSalesLedgerPage,
// getSalesLedgerSummary, getAllFilteredRowsForExport, withGlobalDateRange),
// same underlying `sales_ledger` view, same pagination/sort/export code -
// nothing about fetching or filtering transactions is reimplemented here.

const EMPTY: VerificationDashboardData = {
  historicalImported: 0,
  liveSales: 0,
  totalTransactions: 0,
  importPct: 0,
  duplicateWarnings: 0,
  estimatedHistorical: 0,
  importedHistorical: 0,
  remainingHistorical: 0,
  completionPct: 0,
};

export async function getVerificationDashboard(): Promise<VerificationDashboardData> {
  const { data, error } = await supabase.rpc("verification_dashboard");
  if (error || !data || data.length === 0) {
    if (error) console.error("Error fetching verification dashboard:", error);
    return EMPTY;
  }
  const row = data[0];
  return {
    historicalImported: Number(row.historical_imported) || 0,
    liveSales: Number(row.live_sales) || 0,
    totalTransactions: Number(row.total_transactions) || 0,
    importPct: Number(row.import_pct) || 0,
    duplicateWarnings: Number(row.duplicate_warnings) || 0,
    estimatedHistorical: Number(row.estimated_historical) || 0,
    importedHistorical: Number(row.imported_historical) || 0,
    remainingHistorical: Number(row.remaining_historical) || 0,
    completionPct: Number(row.completion_pct) || 0,
  };
}
