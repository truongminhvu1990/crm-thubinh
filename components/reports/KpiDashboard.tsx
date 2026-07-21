"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, Wallet, Receipt, Scale, UserPlus, Repeat, Gem, UserCheck, Percent, Trophy } from "lucide-react";
import Card from "@/components/ui/Card";
import { DateFilterOption, DateRange, getPreviousEquivalentRange } from "@/lib/dateFilter";
import { getKpiDashboard } from "@/lib/reports/reportsBI.service";
import { buildSalesLedgerHref } from "@/lib/reports/drilldown";
import { currency, NO_SALES_DATA_MESSAGE } from "@/lib/reports/format";
import { ComparisonValue, KpiDashboardData } from "@/types/reportsBI";

// Feature 10 - KPI Dashboard. One consolidated snapshot of the numbers the
// spec names, all scoped to whatever period the Global Date Filter
// currently has selected (Feature 12).
//
// Sprint v2.2.0 Revision 1: Decision 19 (Comparison KPI) adds Current /
// Comparison / Change % to every numeric tile, compared against the
// "previous equivalent period" (Decision 18) of whatever option is active.
// Decision 22 (Universal Drill-down) adds the missing Top Customer tile -
// every tile links into Sales Ledger via the same buildSalesLedgerHref()
// every other section already uses, no new filtering logic.

interface Props {
  option: DateFilterOption;
  range: DateRange | null;
}

const PREVIOUS_PERIOD_LABEL: Record<DateFilterOption, string> = {
  today: "hôm qua",
  this_week: "tuần trước",
  this_month: "tháng trước",
  this_quarter: "quý trước",
  this_year: "năm trước",
  custom: "kỳ trước",
  all_time: "",
};

function ChangeBadge({ comparison }: { comparison: ComparisonValue }) {
  if (comparison.changePct === null) return <span className="text-xs text-muted-foreground">—</span>;
  const isUp = comparison.changePct > 0;
  const isFlat = comparison.changePct === 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
        isFlat ? "text-muted-foreground" : isUp ? "text-secondary" : "text-destructive"
      }`}
    >
      {!isFlat && (isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      {isUp && !isFlat ? "+" : ""}
      {comparison.changePct.toFixed(1)}%
    </span>
  );
}

function NumericTile({
  label,
  icon,
  comparison,
  format,
  href,
  previousLabel,
}: {
  label: string;
  icon: React.ReactNode;
  comparison: ComparisonValue;
  format: (n: number) => string;
  href: string;
  previousLabel: string;
}) {
  return (
    <Link href={href} className="block h-full">
      <Card className="h-full hover:border-primary/40 hover:shadow-md transition-shadow cursor-pointer p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <p className="text-xs">{label}</p>
        </div>
        <p className="text-lg font-bold text-foreground mt-2 truncate">{format(comparison.current)}</p>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ChangeBadge comparison={comparison} />
          {comparison.previous !== null && previousLabel && (
            <span className="truncate">so với {previousLabel} ({format(comparison.previous)})</span>
          )}
        </div>
      </Card>
    </Link>
  );
}

function IdentityTile({ label, icon, value, href }: { label: string; icon: React.ReactNode; value: string; href: string }) {
  return (
    <Link href={href} className="block h-full">
      <Card className="h-full hover:border-primary/40 hover:shadow-md transition-shadow cursor-pointer p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <p className="text-xs">{label}</p>
        </div>
        <p className="text-lg font-bold text-foreground mt-2 truncate" title={value}>
          {value}
        </p>
      </Card>
    </Link>
  );
}

export default function KpiDashboard({ option, range }: Props) {
  const [data, setData] = useState<KpiDashboardData | null>(null);
  const previousRange = getPreviousEquivalentRange(option, range);

  useEffect(() => {
    getKpiDashboard(range, previousRange).then(setData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.start, range?.end, previousRange?.start, previousRange?.end]);

  if (data && !data.hasData) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground text-center py-8">{NO_SALES_DATA_MESSAGE}</p>
      </Card>
    );
  }

  const baseHref = buildSalesLedgerHref({ dateRange: range });
  const previousLabel = PREVIOUS_PERIOD_LABEL[option];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <NumericTile
        label="Doanh thu"
        icon={<Wallet className="w-4 h-4" />}
        comparison={data?.revenue ?? { current: 0, previous: null, changePct: null }}
        format={(n) => currency.format(n)}
        href={baseHref}
        previousLabel={previousLabel}
      />
      <NumericTile
        label="Giao dịch"
        icon={<Receipt className="w-4 h-4" />}
        comparison={data?.transactions ?? { current: 0, previous: null, changePct: null }}
        format={(n) => `${n}`}
        href={baseHref}
        previousLabel={previousLabel}
      />
      <NumericTile
        label="Giá trị TB"
        icon={<Scale className="w-4 h-4" />}
        comparison={data?.avgSale ?? { current: 0, previous: null, changePct: null }}
        format={(n) => currency.format(n)}
        href={baseHref}
        previousLabel={previousLabel}
      />
      <NumericTile
        label="Hoa hồng"
        icon={<Percent className="w-4 h-4" />}
        comparison={data?.commission ?? { current: 0, previous: null, changePct: null }}
        format={(n) => currency.format(n)}
        href={baseHref}
        previousLabel={previousLabel}
      />
      <NumericTile
        label="Khách hàng mới"
        icon={<UserPlus className="w-4 h-4" />}
        comparison={data?.newCustomers ?? { current: 0, previous: null, changePct: null }}
        format={(n) => `${n}`}
        href={baseHref}
        previousLabel={previousLabel}
      />
      <NumericTile
        label="Khách hàng quay lại"
        icon={<Repeat className="w-4 h-4" />}
        comparison={data?.returningCustomers ?? { current: 0, previous: null, changePct: null }}
        format={(n) => `${n}`}
        href={baseHref}
        previousLabel={previousLabel}
      />
      <IdentityTile
        label="Sản phẩm bán chạy nhất"
        icon={<Gem className="w-4 h-4" />}
        value={data?.topProduct?.product_name || data?.topProduct?.product_code || "—"}
        href={
          data?.topProduct
            ? buildSalesLedgerHref({ dateRange: range, productCode: data.topProduct.product_code || undefined })
            : baseHref
        }
      />
      <IdentityTile
        label="Khách hàng hàng đầu"
        icon={<Trophy className="w-4 h-4" />}
        value={data?.topCustomer?.customer_name || "—"}
        href={
          data?.topCustomer
            ? buildSalesLedgerHref({ dateRange: range, customerCode: data.topCustomer.customer_code })
            : baseHref
        }
      />
      <IdentityTile
        label="Nhân viên xuất sắc nhất"
        icon={<UserCheck className="w-4 h-4" />}
        value={data?.topStaff?.full_name || "—"}
        href={data?.topStaff ? buildSalesLedgerHref({ dateRange: range, salespersonId: data.topStaff.staff_id }) : baseHref}
      />
    </div>
  );
}
