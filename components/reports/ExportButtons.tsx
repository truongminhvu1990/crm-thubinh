"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import Button from "@/components/ui/Button";
import { ExcelColumn, downloadBlob, exportRowsToExcel } from "@/lib/reports/reportsBIExport";

// Feature 9 - Export Center. Shared by every BI Center table: Excel export
// works (exports exactly the `rows` passed in - whatever the section is
// currently displaying); PDF is explicitly out of scope this sprint and
// stays disabled, mirroring the existing "Coming Soon" export button
// pattern already used on every legacy Reports table
// (components/reports/ReportsTable.tsx).
interface Props<T> {
  sheetName: string;
  filename: string;
  columns: ExcelColumn<T>[];
  rows: T[];
}

export default function ExportButtons<T,>({ sheetName, filename, columns, rows }: Props<T>) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const blob = await exportRowsToExcel(sheetName, columns, rows);
      downloadBlob(blob, filename);
    } catch (error) {
      alert("Lỗi khi xuất Excel");
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={handleExport} disabled={isExporting || rows.length === 0}>
        <Download className="w-3.5 h-3.5" />
        {isExporting ? "Đang xuất..." : "Xuất Excel"}
      </Button>
      <button
        type="button"
        disabled
        title="Coming Soon"
        className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-muted px-3 py-1.5 text-sm text-muted-foreground opacity-50 cursor-not-allowed"
      >
        <FileText className="w-3.5 h-3.5" />
        PDF (Coming Soon)
      </button>
    </div>
  );
}
