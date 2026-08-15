"use client";

import { MonthlySoldProductsColumnDef, MonthlySoldProductsColumnKey } from "@/lib/monthlySoldProducts/monthlySoldProductsColumns";
import ColumnPicker from "@/components/reports/ColumnPicker";

interface Props {
  columns: MonthlySoldProductsColumnDef[];
  visibleColumns: Set<MonthlySoldProductsColumnKey>;
  onChange: (visible: Set<MonthlySoldProductsColumnKey>) => void;
}

/** Monthly Sold Products' own "Cột hiển thị" control - a thin adapter over
 * the generic components/reports/ColumnPicker.tsx (shared UI
 * infrastructure, Task 5) around this report's own column definitions.
 * Deliberately separate from SalesLedgerColumnPicker even though both
 * wrap the same generic component - the two reports' column schemas are
 * never merged. */
export default function MonthlySoldProductsColumnPicker({ columns, visibleColumns, onChange }: Props) {
  return (
    <ColumnPicker<MonthlySoldProductsColumnKey>
      testId="monthly-sold-products-columns-button"
      columns={columns}
      visibleKeys={visibleColumns}
      onChange={onChange}
    />
  );
}
