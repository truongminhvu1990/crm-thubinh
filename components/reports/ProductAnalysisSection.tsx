"use client";

import { useEffect, useState } from "react";
import { Gem } from "lucide-react";
import { DateRange } from "@/lib/dateFilter";
import { getProductAnalysis } from "@/lib/reports/reportsBI.service";
import { buildSalesLedgerHref } from "@/lib/reports/drilldown";
import { currency, formatPercent, NO_SALES_DATA_MESSAGE } from "@/lib/reports/format";
import { ProductAnalysisRow } from "@/types/reportsBI";
import AnalysisTable, { AnalysisColumn } from "@/components/reports/AnalysisTable";
import ExportButtons from "@/components/reports/ExportButtons";

// Feature 2 - Product Analysis (Top Selling Products).

interface Props {
  range: DateRange | null;
}

const COLUMNS: AnalysisColumn<ProductAnalysisRow>[] = [
  {
    header: "Sản phẩm",
    render: (r) => (
      <div>
        <div className="font-medium text-foreground">{r.product_name || "—"}</div>
        <div className="text-xs text-muted-foreground">{r.product_code || "—"}</div>
      </div>
    ),
  },
  { header: "Doanh thu", align: "right", render: (r) => currency.format(r.revenue) },
  { header: "Giao dịch", align: "right", render: (r) => r.transactions },
  { header: "Giá trị TB", align: "right", render: (r) => currency.format(r.avg_sale) },
  { header: "Đóng góp %", align: "right", render: (r) => formatPercent(r.contribution_pct) },
];

export default function ProductAnalysisSection({ range }: Props) {
  const [rows, setRows] = useState<ProductAnalysisRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // No synchronous setIsLoading(true) here (stays true only until the
    // first load) - a range change just updates rows in place once the new
    // data arrives, rather than re-entering a loading state and flashing
    // the spinner over already-visible data.
    getProductAnalysis(range, 10).then((data) => {
      setRows(data);
      setIsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.start, range?.end]);

  return (
    <AnalysisTable
      icon={<Gem className="w-5 h-5 text-primary" />}
      title="Sản phẩm bán chạy"
      columns={COLUMNS}
      rows={rows}
      isLoading={isLoading}
      rowKey={(r) => r.product_id}
      rowHref={(r) => buildSalesLedgerHref({ dateRange: range, productCode: r.product_code || undefined })}
      emptyLabel={NO_SALES_DATA_MESSAGE}
      actions={
        <ExportButtons
          sheetName="San pham"
          filename={`phan-tich-san-pham-${new Date().toISOString().slice(0, 10)}.xlsx`}
          columns={[
            { header: "Mã sản phẩm", width: 16, value: (r: ProductAnalysisRow) => r.product_code || "" },
            { header: "Tên sản phẩm", width: 28, value: (r: ProductAnalysisRow) => r.product_name || "" },
            { header: "Doanh thu", width: 16, value: (r: ProductAnalysisRow) => r.revenue },
            { header: "Giao dịch", width: 12, value: (r: ProductAnalysisRow) => r.transactions },
            { header: "Giá trị TB", width: 16, value: (r: ProductAnalysisRow) => r.avg_sale },
            { header: "Đóng góp %", width: 14, value: (r: ProductAnalysisRow) => Number(r.contribution_pct.toFixed(1)) },
          ]}
          rows={rows}
        />
      }
    />
  );
}
