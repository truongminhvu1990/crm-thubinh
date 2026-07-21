"use client";

import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { DateRange } from "@/lib/dateFilter";
import { getCategoryAnalysis } from "@/lib/reports/reportsBI.service";
import { buildSalesLedgerHref } from "@/lib/reports/drilldown";
import { currency, formatPercent, NO_SALES_DATA_MESSAGE } from "@/lib/reports/format";
import { CategoryAnalysisRow } from "@/types/reportsBI";
import AnalysisTable, { AnalysisColumn } from "@/components/reports/AnalysisTable";
import ExportButtons from "@/components/reports/ExportButtons";

// Feature 3 - Category Analysis.

interface Props {
  range: DateRange | null;
}

const COLUMNS: AnalysisColumn<CategoryAnalysisRow>[] = [
  { header: "Danh mục", render: (r) => r.category },
  { header: "Doanh thu", align: "right", render: (r) => currency.format(r.revenue) },
  { header: "Giao dịch", align: "right", render: (r) => r.transactions },
  { header: "Đóng góp %", align: "right", render: (r) => formatPercent(r.contribution_pct) },
];

export default function CategoryAnalysisSection({ range }: Props) {
  const [rows, setRows] = useState<CategoryAnalysisRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getCategoryAnalysis(range).then((data) => {
      setRows(data);
      setIsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.start, range?.end]);

  return (
    <AnalysisTable
      icon={<Layers className="w-5 h-5 text-primary" />}
      title="Danh mục sản phẩm"
      columns={COLUMNS}
      rows={rows}
      isLoading={isLoading}
      rowKey={(r) => r.category}
      rowHref={(r) => buildSalesLedgerHref({ dateRange: range, productCategory: r.category })}
      emptyLabel={NO_SALES_DATA_MESSAGE}
      actions={
        <ExportButtons
          sheetName="Danh muc"
          filename={`phan-tich-danh-muc-${new Date().toISOString().slice(0, 10)}.xlsx`}
          columns={[
            { header: "Danh mục", width: 24, value: (r: CategoryAnalysisRow) => r.category },
            { header: "Doanh thu", width: 16, value: (r: CategoryAnalysisRow) => r.revenue },
            { header: "Giao dịch", width: 12, value: (r: CategoryAnalysisRow) => r.transactions },
            { header: "Đóng góp %", width: 14, value: (r: CategoryAnalysisRow) => Number(r.contribution_pct.toFixed(1)) },
          ]}
          rows={rows}
        />
      }
    />
  );
}
