"use client";

import { useEffect, useState } from "react";
import {
  Wallet,
  ShoppingCart,
  Layers,
  Palette,
  Ruler,
  TrendingUp,
  Users,
  LineChart as LineChartIcon,
} from "lucide-react";
import StatCard from "@/components/ui/StatCard";
import Card from "@/components/ui/Card";
import RankingTable from "@/components/market-intelligence/RankingTable";
import LineChart from "@/components/market-intelligence/LineChart";
import { getMarketIntelligenceData, MarketIntelligenceData } from "@/lib/marketIntelligence/marketIntelligence.service";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const count = new Intl.NumberFormat("vi-VN");

function formatMonthLabel(month: string): string {
  const match = month?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return month || "—";
  return `${match[2]}/${match[1]}`;
}

/**
 * Read-only, single page - Summary Cards, Category/Color/Size Rankings
 * (All Time, no date filter), and Monthly Trends (Line Charts, month-only)
 * (docs/MARKET_INTELLIGENCE_SPEC.md Revision 2 + docs/MARKET_INTELLIGENCE_UI.md
 * Revision 2, both LOCKED). No edit/create/delete/export control anywhere.
 * No dependency on any other module's service file (Spec §1 Independence).
 */
export default function MarketIntelligencePage() {
  const [data, setData] = useState<MarketIntelligenceData | null>(null);

  useEffect(() => {
    getMarketIntelligenceData().then(setData);
  }, []);

  if (data === null) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  const noTrendData = data.customerBuyingTrend.length === 0;

  return (
    <div className="pb-8 space-y-8">
      <div className="mb-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Thông tin thị trường</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Xu hướng và thông tin thị trường dựa trên dữ liệu CRM hiện có.
        </p>
      </div>

      {/* Summary Cards - MARKET_INTELLIGENCE_UI.md §1.2, Decision 1 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Tổng doanh thu" value={currency.format(data.summary.totalRevenue)} icon={<Wallet className="w-5 h-5 text-primary" />} />
        <StatCard title="Tổng lượt mua" value={count.format(data.summary.totalPurchases)} icon={<ShoppingCart className="w-5 h-5 text-primary" />} />
        <StatCard title="Tổng danh mục" value={count.format(data.summary.totalCategories)} icon={<Layers className="w-5 h-5 text-primary" />} />
        <StatCard title="Tổng màu sắc" value={count.format(data.summary.totalColors)} icon={<Palette className="w-5 h-5 text-primary" />} />
      </section>

      {/* Category Rankings - §1.4 */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          Danh mục phổ biến
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RankingTable
            icon={<ShoppingCart className="w-4 h-4 text-primary" />}
            title="Theo số lượt mua"
            labelHeader="Danh mục"
            valueHeader="Số lượt mua"
            rows={data.categoryRankings.byPurchaseCount}
            emptyLabel="Chưa có dữ liệu"
            formatValue={(v) => count.format(v)}
          />
          <RankingTable
            icon={<Wallet className="w-4 h-4 text-primary" />}
            title="Theo doanh thu"
            labelHeader="Danh mục"
            valueHeader="Doanh thu"
            rows={data.categoryRankings.byRevenue}
            emptyLabel="Chưa có dữ liệu"
            formatValue={(v) => currency.format(v)}
          />
        </div>
      </section>

      {/* Color Rankings - §1.5 */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary" />
          Màu sắc phổ biến
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RankingTable
            icon={<ShoppingCart className="w-4 h-4 text-primary" />}
            title="Theo số lượt mua"
            labelHeader="Màu sắc"
            valueHeader="Số lượt mua"
            rows={data.colorRankings.byPurchaseCount}
            emptyLabel="Chưa có dữ liệu"
            formatValue={(v) => count.format(v)}
          />
          <RankingTable
            icon={<Wallet className="w-4 h-4 text-primary" />}
            title="Theo doanh thu"
            labelHeader="Màu sắc"
            valueHeader="Doanh thu"
            rows={data.colorRankings.byRevenue}
            emptyLabel="Chưa có dữ liệu"
            formatValue={(v) => currency.format(v)}
          />
        </div>
      </section>

      {/* Size Rankings - §1.6, single ranking only (Decision 5) */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Ruler className="w-5 h-5 text-primary" />
          Kích thước phổ biến
        </h2>
        <RankingTable
          icon={<ShoppingCart className="w-4 h-4 text-primary" />}
          title="Theo số lượt mua"
          labelHeader="Kích thước"
          valueHeader="Số lượt mua"
          rows={data.sizeRankings}
          emptyLabel="Chưa có dữ liệu"
          formatValue={(v) => count.format(v)}
        />
      </section>

      {/* Monthly Trends - §1.7, Line Charts only, month-only, fixed aggregate (no selector) */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Xu hướng theo tháng
        </h2>

        <Card>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-primary" />
            Xu hướng mua hàng của khách
          </h3>
          {noTrendData ? (
            <p className="text-sm text-muted-foreground text-center py-8">Chưa có dữ liệu giao dịch</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <p className="text-xs text-muted-foreground mb-2">Số lượt mua</p>
                <LineChart
                  data={data.customerBuyingTrend}
                  metric="purchaseCount"
                  formatValue={(v) => count.format(v)}
                  formatMonth={formatMonthLabel}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Doanh thu</p>
                <LineChart
                  data={data.customerBuyingTrend}
                  metric="revenue"
                  formatValue={(v) => currency.format(v)}
                  formatMonth={formatMonthLabel}
                />
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <LineChartIcon className="w-4 h-4 text-primary" />
            Xu hướng nhu cầu sản phẩm
          </h3>
          {data.productDemandTrend.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Chưa có dữ liệu giao dịch</p>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Số lượt mua</p>
              <LineChart
                data={data.productDemandTrend}
                metric="purchaseCount"
                formatValue={(v) => count.format(v)}
                formatMonth={formatMonthLabel}
              />
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
