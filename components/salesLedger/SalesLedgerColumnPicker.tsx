"use client";

import { SalesLedgerColumnDef, SalesLedgerColumnKey } from "@/lib/salesLedger/salesLedgerColumns";
import ColumnPicker from "@/components/reports/ColumnPicker";

interface Props {
  columns: SalesLedgerColumnDef[];
  visibleColumns: Set<SalesLedgerColumnKey>;
  onChange: (visible: Set<SalesLedgerColumnKey>) => void;
}

/** Sales Ledger's own "Cột hiển thị" control - a thin adapter over the
 * generic components/reports/ColumnPicker.tsx (shared UI infrastructure,
 * Task 5) around Sales Ledger's own column definitions. Kept as its own
 * component (rather than calling ColumnPicker directly from the page) so
 * the page's call site and this component's data-testid stay stable. */
export default function SalesLedgerColumnPicker({ columns, visibleColumns, onChange }: Props) {
  return (
    <ColumnPicker<SalesLedgerColumnKey>
      testId="sales-ledger-columns-button"
      columns={columns}
      visibleKeys={visibleColumns}
      onChange={onChange}
    />
  );
}
