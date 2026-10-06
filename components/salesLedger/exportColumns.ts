import { getAvailableSalesLedgerColumns, SalesLedgerColumnContext, SalesLedgerColumnDef } from "@/lib/salesLedger/salesLedgerColumns";

/**
 * Sales Ledger Excel columns, moved here unchanged from the page so they can be unit-tested.
 *
 * LOCKED (Product Owner, Wave B1.3): the export does NOT follow the order the user chose in the table. It keeps the registry order of
 * lib/salesLedger/salesLedgerColumns.ts, exactly as before; only the VISIBLE SET comes from the current column preference. Columns
 * the viewer may not see (cost / profit without the permission, verification columns outside Verification Mode) are never included,
 * and "Số đơn" keeps exporting an empty cell (its exportValue is unchanged).
 */
export function buildSalesLedgerExportColumns(ctx: SalesLedgerColumnContext, isVisible: (key: string) => boolean): SalesLedgerColumnDef[] {
  return getAvailableSalesLedgerColumns(ctx).filter((c) => isVisible(c.key));
}

/** Cost is only looked up for the exported rows when a cost / profit column is both permitted and visible (unchanged rule). */
export function exportNeedsCost(canViewCostAndProfit: boolean, isVisible: (key: string) => boolean): boolean {
  return canViewCostAndProfit && (isVisible("cost_price") || isVisible("profit"));
}
