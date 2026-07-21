"use client";

import { useEffect, useState } from "react";
import { UserPlus, Repeat, Scale, Wallet, Trophy } from "lucide-react";
import Card from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import { DateRange } from "@/lib/dateFilter";
import { getCustomerSummary, getTopCustomers } from "@/lib/reports/reportsBI.service";
import { buildSalesLedgerHref } from "@/lib/reports/drilldown";
import { currency, NO_SALES_DATA_MESSAGE } from "@/lib/reports/format";
import { CustomerSummary, TopCustomerRow } from "@/types/reportsBI";
import AnalysisTable, { AnalysisColumn } from "@/components/reports/AnalysisTable";
import ExportButtons from "@/components/reports/ExportButtons";

// Feature 4 - Customer Analysis.

interface Props {
  range: DateRange | null;
}

const COLUMNS: AnalysisColumn<TopCustomerRow>[] = [
  {
    header: "Khách hàng",
    render: (r) => (
      <div>
        <div className="font-medium text-foreground">{r.customer_name}</div>
        <div className="text-xs text-muted-foreground">{r.customer_code}</div>
      </div>
    ),
  },
  { header: "Doanh thu kỳ này", align: "right", render: (r) => currency.format(r.period_revenue) },
  { header: "Số lần mua", align: "right", render: (r) => r.period_transactions },
  { header: "Giá trị TB", align: "right", render: (r) => currency.format(r.avg_sale) },
  { header: "Doanh thu trọn đời", align: "right", render: (r) => currency.format(r.lifetime_revenue) },
];

export default function CustomerAnalysisSection({ range }: Props) {
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [rows, setRows] = useState<TopCustomerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCustomerSummary(range), getTopCustomers(range, 10)]).then(([summaryData, topRows]) => {
      setSummary(summaryData);
      setRows(topRows);
      setIsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.start, range?.end]);

  const lifetimeRevenueOfTop = rows.reduce((sum, r) => sum + r.lifetime_revenue, 0);

  if (!isLoading && rows.length === 0) {
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
          title="Khách hàng mới"
          value={summary ? summary.new_customers : "—"}
          icon={<UserPlus className="w-5 h-5 text-primary" />}
          placeholder={summary === null}
        />
        <StatCard
          title="Khách hàng quay lại"
          value={summary ? summary.returning_customers : "—"}
          icon={<Repeat className="w-5 h-5 text-primary" />}
          placeholder={summary === null}
        />
        <StatCard
          title="Giá trị mua TB"
          value={summary ? currency.format(summary.avg_purchase) : "—"}
          icon={<Scale className="w-5 h-5 text-primary" />}
          placeholder={summary === null}
        />
        <StatCard
          title="Doanh thu trọn đời (top 10)"
          value={currency.format(lifetimeRevenueOfTop)}
          icon={<Wallet className="w-5 h-5 text-primary" />}
          placeholder={isLoading}
        />
      </div>

      <AnalysisTable
        icon={<Trophy className="w-5 h-5 text-primary" />}
        title="Khách hàng hàng đầu"
        columns={COLUMNS}
        rows={rows}
        isLoading={isLoading}
        rowKey={(r) => r.customer_id}
        rowHref={(r) => buildSalesLedgerHref({ dateRange: range, customerCode: r.customer_code })}
        emptyLabel={NO_SALES_DATA_MESSAGE}
        actions={
          <ExportButtons
            sheetName="Khach hang"
            filename={`phan-tich-khach-hang-${new Date().toISOString().slice(0, 10)}.xlsx`}
            columns={[
              { header: "Mã khách hàng", width: 16, value: (r: TopCustomerRow) => r.customer_code },
              { header: "Tên khách hàng", width: 24, value: (r: TopCustomerRow) => r.customer_name },
              { header: "Doanh thu kỳ này", width: 18, value: (r: TopCustomerRow) => r.period_revenue },
              { header: "Số lần mua", width: 12, value: (r: TopCustomerRow) => r.period_transactions },
              { header: "Giá trị TB", width: 16, value: (r: TopCustomerRow) => r.avg_sale },
              { header: "Doanh thu trọn đời", width: 18, value: (r: TopCustomerRow) => r.lifetime_revenue },
            ]}
            rows={rows}
          />
        }
      />
    </div>
  );
}
