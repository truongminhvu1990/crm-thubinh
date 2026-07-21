"use client";

import { useEffect, useMemo, useState } from "react";
import { Wallet, Percent, Receipt, Scale, Trophy } from "lucide-react";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import { DateRange } from "@/lib/dateFilter";
import { getStaffAnalysis } from "@/lib/reports/reportsBI.service";
import { buildSalesLedgerHref } from "@/lib/reports/drilldown";
import { currency, NO_SALES_DATA_MESSAGE } from "@/lib/reports/format";
import { StaffAnalysisRow } from "@/types/reportsBI";
import AnalysisTable, { AnalysisColumn } from "@/components/reports/AnalysisTable";
import ExportButtons from "@/components/reports/ExportButtons";

// Feature 5 - Sales Staff Analysis.

interface Props {
  range: DateRange | null;
}

const COLUMNS: AnalysisColumn<StaffAnalysisRow>[] = [
  {
    header: "Nhân viên",
    render: (r) => (
      <div>
        <div className="font-medium text-foreground">{r.full_name}</div>
        <div className="text-xs text-muted-foreground">{r.staff_code}</div>
      </div>
    ),
  },
  { header: "Doanh thu", align: "right", render: (r) => currency.format(r.revenue) },
  { header: "Hoa hồng", align: "right", render: (r) => currency.format(r.commission) },
  { header: "Giao dịch", align: "right", render: (r) => r.transactions },
  { header: "Giá trị TB", align: "right", render: (r) => currency.format(r.avg_sale) },
];

export default function StaffAnalysisSection({ range }: Props) {
  // Fetched uncapped (still one small GROUP BY result server-side, one row
  // per staff member) so the summary cards total every staff member's
  // figures, not just the ones that fit in the Top 10 table below.
  const [allRows, setAllRows] = useState<StaffAnalysisRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getStaffAnalysis(range, 1000).then((data) => {
      setAllRows(data);
      setIsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.start, range?.end]);

  const rows = allRows.slice(0, 10);

  const totals = useMemo(
    () =>
      allRows.reduce(
        (acc, r) => ({
          revenue: acc.revenue + r.revenue,
          commission: acc.commission + r.commission,
          transactions: acc.transactions + r.transactions,
        }),
        { revenue: 0, commission: 0, transactions: 0 }
      ),
    [allRows]
  );
  const avgSale = totals.transactions > 0 ? totals.revenue / totals.transactions : 0;

  if (!isLoading && allRows.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground text-center py-8">{NO_SALES_DATA_MESSAGE}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Doanh thu"
          value={currency.format(totals.revenue)}
          icon={<Wallet className="w-5 h-5 text-primary" />}
          placeholder={isLoading}
        />
        <StatCard
          title="Hoa hồng"
          value={currency.format(totals.commission)}
          icon={<Percent className="w-5 h-5 text-primary" />}
          placeholder={isLoading}
        />
        <StatCard
          title="Giao dịch"
          value={totals.transactions}
          icon={<Receipt className="w-5 h-5 text-primary" />}
          placeholder={isLoading}
        />
        <StatCard
          title="Giá trị TB"
          value={currency.format(avgSale)}
          icon={<Scale className="w-5 h-5 text-primary" />}
          placeholder={isLoading}
        />
      </div>

      <AnalysisTable
        icon={<Trophy className="w-5 h-5 text-primary" />}
        title="Nhân viên xuất sắc"
        columns={COLUMNS}
        rows={rows}
        isLoading={isLoading}
        rowKey={(r) => r.staff_id}
        rowHref={(r) => buildSalesLedgerHref({ dateRange: range, salespersonId: r.staff_id })}
        emptyLabel={NO_SALES_DATA_MESSAGE}
        actions={
          <ExportButtons
            sheetName="Nhan vien"
            filename={`phan-tich-nhan-vien-${new Date().toISOString().slice(0, 10)}.xlsx`}
            columns={[
              { header: "Mã nhân viên", width: 16, value: (r: StaffAnalysisRow) => r.staff_code },
              { header: "Tên nhân viên", width: 24, value: (r: StaffAnalysisRow) => r.full_name },
              { header: "Doanh thu", width: 16, value: (r: StaffAnalysisRow) => r.revenue },
              { header: "Hoa hồng", width: 16, value: (r: StaffAnalysisRow) => r.commission },
              { header: "Giao dịch", width: 12, value: (r: StaffAnalysisRow) => r.transactions },
              { header: "Giá trị TB", width: 16, value: (r: StaffAnalysisRow) => r.avg_sale },
            ]}
            rows={rows}
          />
        }
      />
    </div>
  );
}
