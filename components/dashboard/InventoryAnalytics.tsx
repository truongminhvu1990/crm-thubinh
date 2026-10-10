"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCanonicalFetch } from "@/components/reports/overview/useCanonicalFetch";
import { currency } from "@/lib/reports/format";
import { INVENTORY_CURRENT_STATE_LABEL, METRIC_LABELS } from "@/lib/reports/overviewUi";
import type { InventoryBreakdown } from "@/lib/reports/inventoryValue.service";
import { inventoryCategoryHref } from "@/lib/reports/analytics/compositionHref";
import ChartCard from "./ChartCard";
import { barChartHeight, compactMoney, truncateLabel } from "./chartFormat";

// Dashboard biểu đồ - Wave B (F9) "Tồn kho hiện tại". CURRENT inventory: Held (products.status Reserved) and Remaining (Available) by
// products.category - a count of product records and the sum of products.sale_price. It has NO date: the Dashboard date filter is not an
// input here, and the request carries none. The numbers are the very same rows as the Held / Remaining cards, so each total below equals
// the card. The table under the chart gives the exact quantity and value and is the keyboard / screen-reader way to open a drill-down.

interface InventoryResponse extends InventoryBreakdown {
  range: null;
}

const HELD_COLOR = "var(--primary)";
const REMAINING_COLOR = "var(--secondary)";

interface Row {
  key: string;
  label: string;
  category: string | null;
  held: number;
  remaining: number;
  heldCount: number;
  remainingCount: number;
}

const unit = (n: number) => `${n.toLocaleString("vi-VN")} sản phẩm`;

export default function InventoryAnalytics() {
  const router = useRouter();
  const { data, loading, error } = useCanonicalFetch<InventoryResponse>("/api/reports/analytics/inventory");
  const empty = !!data && data.held.count + data.remaining.count === 0;

  const rows: Row[] = data
    ? data.categories.map((c) => ({
        key: c.category ?? "uncategorized",
        label: c.label,
        category: c.category,
        held: c.held.value,
        remaining: c.remaining.value,
        heldCount: c.held.count,
        remainingCount: c.remaining.count,
      }))
    : [];
  const missingPrice = data ? data.held.missingPriceCount + data.remaining.missingPriceCount : 0;

  const open = (view: "held" | "remaining") => (_: unknown, index: number) => {
    const r = rows[index];
    if (r && (view === "held" ? r.heldCount : r.remainingCount) > 0) router.push(inventoryCategoryHref(view, r.category));
  };

  return (
    <div className="mb-6" data-testid="dashboard-inventory-analytics">
      <ChartCard
        testId="dashboard-inventory"
        title="Tồn kho hiện tại"
        basis="Không phụ thuộc bộ lọc ngày · Số lượng = số sản phẩm theo trạng thái hiện tại · Giá trị = giá bán sản phẩm"
        loading={loading}
        error={error}
        empty={empty}
        emptyText="Hiện không có sản phẩm đang giữ hoặc còn lại."
      >
        <p className="mt-1 text-sm font-medium text-foreground" data-testid="inventory-current-label">{INVENTORY_CURRENT_STATE_LABEL}</p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="inventory-kpis">
          <div className="rounded-lg border border-border p-3" data-testid="inventory-kpi-held">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ background: HELD_COLOR }} />
              {METRIC_LABELS.held}
            </p>
            <p className="mt-1 text-xl font-bold text-foreground">{data ? currency.format(data.held.value) : ""}</p>
            <p className="text-xs text-muted-foreground">{data ? unit(data.held.count) : ""}</p>
          </div>
          <div className="rounded-lg border border-border p-3" data-testid="inventory-kpi-remaining">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ background: REMAINING_COLOR }} />
              {METRIC_LABELS.remaining}
            </p>
            <p className="mt-1 text-xl font-bold text-foreground">{data ? currency.format(data.remaining.value) : ""}</p>
            <p className="text-xs text-muted-foreground">{data ? unit(data.remaining.count) : ""}</p>
          </div>
        </div>

        <div
          className="mt-3 w-full"
          style={{ height: barChartHeight(rows.length) }}
          role="img"
          aria-label={`Biểu đồ cột ngang chồng: giá trị hàng đang giữ và hàng còn lại theo ${rows.length} loại sản phẩm`}
          data-testid="inventory-stacked-chart"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap={6}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={compactMoney} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
              <YAxis
                type="category"
                dataKey="label"
                width={128}
                interval={0}
                tick={{ fontSize: 11, fill: "var(--foreground)" }}
                tickFormatter={(v: string) => truncateLabel(String(v))}
                stroke="var(--border)"
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                content={({ active, payload }) => {
                  const r = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
                  if (!r) return null;
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-md">
                      <p className="font-semibold">{r.label}</p>
                      <p>
                        {METRIC_LABELS.held}: {unit(r.heldCount)} · {currency.format(r.held)}
                      </p>
                      <p>
                        {METRIC_LABELS.remaining}: {unit(r.remainingCount)} · {currency.format(r.remaining)}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="held" name={METRIC_LABELS.held} stackId="inventory" fill={HELD_COLOR} isAnimationActive={false} cursor="pointer" onClick={open("held")} />
              <Bar dataKey="remaining" name={METRIC_LABELS.remaining} stackId="inventory" fill={REMAINING_COLOR} radius={[0, 4, 4, 0]} isAnimationActive={false} cursor="pointer" onClick={open("remaining")} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 overflow-x-auto" data-testid="inventory-table-wrap">
          <table className="w-full min-w-[420px] text-left text-xs" data-testid="inventory-category-table">
            <caption className="sr-only">Tồn kho hiện tại theo loại sản phẩm: số lượng và giá trị</caption>
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 pr-2 font-medium">Loại sản phẩm</th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">{METRIC_LABELS.held}</th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">{METRIC_LABELS.remaining}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-border" data-testid={`inventory-row-${r.key}`}>
                  <th scope="row" className="py-1 pr-2 font-normal text-foreground" title={r.label}>{truncateLabel(r.label, 28)}</th>
                  <td className="py-1 pr-2 text-right">
                    {r.heldCount > 0 ? (
                      <Link className="text-primary underline underline-offset-2" href={inventoryCategoryHref("held", r.category)}>
                        {r.heldCount} · {currency.format(r.held)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    {r.remainingCount > 0 ? (
                      <Link className="text-primary underline underline-offset-2" href={inventoryCategoryHref("remaining", r.category)}>
                        {r.remainingCount} · {currency.format(r.remaining)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {missingPrice > 0 && (
          <p className="mt-2 text-xs text-amber-700" data-testid="inventory-missing-price">
            {missingPrice} sản phẩm chưa có giá bán: vẫn được đếm, nhưng không được tính vào giá trị.
          </p>
        )}
      </ChartCard>
    </div>
  );
}
