import { ExcelColumn } from "@/lib/reports/reportsBIExport";
import { MonthlySoldProductRow } from "@/types/monthlySoldProducts";
import { getAvailableMonthlySoldProductsColumns, recognitionLabel } from "@/lib/monthlySoldProducts/monthlySoldProductsColumns";

/**
 * Excel columns of Monthly Sold Products, moved here unchanged from MonthlySoldProductsSection so they can be unit-tested.
 *
 * LOCKED (Product Owner, Wave B1.2): the export does NOT follow the order the user chose in the table. It keeps the registry order of
 * lib/monthlySoldProducts/monthlySoldProductsColumns.ts, exactly as before; only the VISIBILITY comes from the current preference.
 * "Ghi nhận doanh thu" is always appended last, as before.
 */
export function buildMonthlySoldProductsExportColumns(canViewGrossProfit: boolean, isVisible: (key: string) => boolean): ExcelColumn<MonthlySoldProductRow>[] {
  const exportColumns: ExcelColumn<MonthlySoldProductRow>[] = getAvailableMonthlySoldProductsColumns({ canViewGrossProfit })
    .filter((c) => isVisible(c.key))
    .map((c) => ({ header: c.label, width: c.width, value: c.exportValue }));
  // Recognition status is always exported, same as it is always shown.
  exportColumns.push({ header: "Ghi nhận doanh thu", width: 30, value: (r) => recognitionLabel(r) });
  return exportColumns;
}
