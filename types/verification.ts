// Data Verification Center (Sprint v2.3.0). Mirrors verification_dashboard()'s
// RETURNS TABLE in supabase/migrations/20260725_data_verification_module.sql -
// nothing here is computed client-side.

export interface VerificationDashboardData {
  historicalImported: number;
  liveSales: number;
  totalTransactions: number;
  importPct: number;
  duplicateWarnings: number;
  estimatedHistorical: number;
  importedHistorical: number;
  remainingHistorical: number;
  completionPct: number;
}
