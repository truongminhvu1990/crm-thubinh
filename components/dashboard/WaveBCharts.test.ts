import test, { before, mock } from "node:test";
import assert from "node:assert/strict";
import { createElement, type FC } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import type { BarDatum } from "./HorizontalBarChart";
import type { SalesCompositionResponse } from "@/lib/reports/analytics/composition.service";
import { buildComposition, CompositionLine } from "@/lib/reports/analytics/composition";

/**
 * Dashboard biểu đồ Wave B - the UI layer: states (loading / error / empty / sparse), the data each chart is handed (labels, values, drill-down
 * links, "Khác"), the single combined request, the inventory section (current state, no date), long labels and the narrow layout.
 * Recharts draws nothing without a browser width, so the chart component is replaced by a recorder here and its bars are checked as DATA;
 * clicking a bar and the drawn SVG are covered by the Dev browser UAT.
 */

type FetchState = { data: unknown; loading: boolean; error: string | null };
let fetchState: FetchState = { data: null, loading: true, error: null };
const urls: (string | null)[] = [];
const charts: { data: BarDatum[]; valueLabel: string; ariaLabel: string; testId: string }[] = [];

mock.module("next/navigation", { namedExports: { useRouter: () => ({ push: () => {} }) } });
mock.module("@/components/reports/overview/useCanonicalFetch", {
  namedExports: {
    useCanonicalFetch: (url: string | null) => {
      urls.push(url);
      return url === null ? { data: null, loading: true, error: null } : fetchState;
    },
  },
});
mock.module("./HorizontalBarChart", {
  defaultExport: (props: { data: BarDatum[]; valueLabel: string; ariaLabel: string; testId: string }) => {
    charts.push(props);
    return createElement("div", { "data-testid": props.testId, "data-bars": props.data.length });
  },
});

let SalesCompositionCharts: typeof import("./SalesCompositionCharts").default;
let InventoryAnalytics: typeof import("./InventoryAnalytics").default;
let ChartCard: typeof import("./ChartCard").default;
let fmt: typeof import("./chartFormat");

before(async () => {
  SalesCompositionCharts = (await import("./SalesCompositionCharts")).default;
  InventoryAnalytics = (await import("./InventoryAnalytics")).default;
  ChartCard = (await import("./ChartCard")).default;
  fmt = await import("./chartFormat");
});

function reset(state: FetchState) {
  fetchState = state;
  urls.length = 0;
  charts.length = 0;
}

const SEPT = { start: "2026-09-01", end: "2026-10-01" };
const L = (over: Partial<CompositionLine> & { price: unknown }): CompositionLine => ({
  productId: "00000000-0000-4000-8000-000000000001",
  productCode: "SP1",
  productName: "Vòng 1",
  category: "Vòng",
  productFound: true,
  ...over,
});
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const response = (lines: CompositionLine[], range: typeof SEPT | null = SEPT): SalesCompositionResponse => ({ range, dateBasis: "sale_date", ...buildComposition(lines) });
const html = (range: typeof SEPT | null = SEPT, ready = true) => renderToStaticMarkup(createElement(SalesCompositionCharts, { range, ready }));

// ---- ChartCard ------------------------------------------------------------------------------------------------------------------------

const Card = (): FC<Record<string, unknown>> => ChartCard as unknown as FC<Record<string, unknown>>;

test("ChartCard shows exactly one of: skeleton while loading (never stale content), an alert on error, the empty text, or the chart", () => {
  const render = (p: { loading: boolean; error: string | null; empty: boolean }) =>
    renderToStaticMarkup(createElement(Card(), { title: "T", testId: "t", emptyText: "Trống", ...p }, createElement("div", { "data-testid": "child" })));
  const loading = render({ loading: true, error: null, empty: false });
  assert.ok(loading.includes("data-skeleton") && !loading.includes("data-testid=\"child\""));
  const error = render({ loading: false, error: "Lỗi", empty: false });
  assert.ok(error.includes('role="alert"') && error.includes("Lỗi") && !error.includes("data-testid=\"child\""));
  const empty = render({ loading: false, error: null, empty: true });
  assert.ok(empty.includes("Trống") && !empty.includes("data-testid=\"child\""));
  const ok = render({ loading: false, error: null, empty: false });
  assert.ok(ok.includes("data-testid=\"child\"") && !ok.includes("data-skeleton") && !ok.includes('role="alert"'));
});

// ---- F4 / F5 / F8 ---------------------------------------------------------------------------------------------------------------------

test("one combined request feeds F4, F5 and F8, carries the Dashboard range, and none is sent before the filter is ready", () => {
  reset({ data: null, loading: true, error: null });
  html(SEPT, true);
  assert.deepEqual(urls, ["/api/reports/analytics/composition?start=2026-09-01&end=2026-10-01"], "ONE url for the three charts");
  reset({ data: null, loading: true, error: null });
  html(null, true);
  assert.deepEqual(urls, ["/api/reports/analytics/composition"], "all time: no range");
  reset({ data: null, loading: true, error: null });
  const notReady = html(SEPT, false);
  assert.deepEqual(urls, [null], "no fetch before the date filter is ready");
  assert.equal((notReady.match(/data-skeleton/g) ?? []).length, 3, "three skeleton regions");
});

test("loading: skeleton in all three cards, no chart and no previous bars", () => {
  reset({ data: null, loading: true, error: null });
  const out = html();
  assert.equal((out.match(/data-skeleton/g) ?? []).length, 3);
  assert.equal(charts.length, 0);
});

test("error: an alert in all three cards, never an empty chart", () => {
  reset({ data: null, loading: false, error: "Không tải được dữ liệu (500)" });
  const out = html();
  assert.equal((out.match(/role="alert"/g) ?? []).length, 3);
  assert.equal(charts.length, 0);
});

test("empty period: the standard empty text in all three cards, no chart", () => {
  reset({ data: response([]), loading: false, error: null });
  const out = html();
  assert.equal((out.match(/Không có dữ liệu bán hàng trong kỳ này\./g) ?? []).length, 3);
  assert.equal(charts.length, 0);
});

test("sparse data (one sale): every chart still renders, with a stable six-band axis", () => {
  reset({ data: response([L({ price: 12_000_000 })]), loading: false, error: null });
  const out = html();
  assert.equal(charts.length, 3);
  const bands = charts.find((c) => c.testId === "price-bands-chart")!;
  assert.equal(bands.data.length, 6);
  assert.equal(bands.data.find((b) => b.key === "10to20m")?.value, 12_000_000);
  assert.equal(charts.find((c) => c.testId === "top-products-chart")!.data.length, 1);
  assert.doesNotMatch(out, /price-bands-no-price/);
});

test("F4 hands the chart the ranked products by recognized value, 'Khác' for the rest, and an exact ledger link per product", () => {
  const many = Array.from({ length: 13 }, (_, i) => L({ price: (i + 1) * 1_000_000, productId: uid(i + 1), productCode: `SP${i + 1}`, productName: `Tên ${i + 1}` }));
  reset({ data: response(many), loading: false, error: null });
  html();
  const bars = charts.find((c) => c.testId === "top-products-chart")!.data;
  assert.equal(bars.length, 11, "10 products + Khác");
  assert.equal(bars[0].label, "SP13 · Tên 13");
  assert.equal(bars[0].value, 13_000_000);
  const href = new URL(bars[0].href!, "http://x");
  assert.equal(href.pathname, "/reports/sales-ledger");
  assert.equal(href.searchParams.get("productId"), uid(13));
  assert.equal(href.searchParams.get("dateFrom"), "2026-09-01");
  assert.equal(href.searchParams.get("dateTo"), "2026-10-01");
  assert.equal(href.searchParams.get("recognizedOnly"), "1");
  const others = bars[10];
  assert.equal(others.label, "Khác (3 sản phẩm)");
  assert.equal(others.href, null, "'Khác' is not one product, so it is not a link");
  assert.equal(others.value, 1_000_000 + 2_000_000 + 3_000_000);
  assert.equal(charts.find((c) => c.testId === "top-products-chart")!.valueLabel, "Doanh thu đã ghi nhận");
  assert.ok(bars[0].lines?.some((l) => l.startsWith("Số giao dịch: 1")) && bars[0].lines?.some((l) => l.startsWith("Tỷ trọng:")));
});

test("F5 hands the chart every category incl. fee categories and 'Chưa phân loại'; the link filters on the real value, not the label", () => {
  reset({
    data: response([
      L({ price: 100, category: "Vòng" }),
      L({ price: 10, category: "Phí vận chuyển", productId: uid(2) }),
      L({ price: 20, category: null, productId: uid(3) }),
    ]),
    loading: false,
    error: null,
  });
  html();
  const bars = charts.find((c) => c.testId === "top-categories-chart")!.data;
  assert.deepEqual(bars.map((b) => b.label), ["Vòng", "Chưa phân loại", "Phí vận chuyển"]);
  const none = new URL(bars[1].href!, "http://x").searchParams;
  assert.equal(none.get("uncategorized"), "1");
  assert.equal(none.get("productCategory"), null);
  assert.equal(new URL(bars[2].href!, "http://x").searchParams.get("productCategory"), "Phí vận chuyển");
});

test("F8 hands the chart the six locked bands with [min, max) links; 'Không có giá' is shown as a note, has no link, and is not hidden", () => {
  reset({ data: response([L({ price: 5_000_000 }), L({ price: null, productId: uid(2) })]), loading: false, error: null });
  const out = html();
  const bars = charts.find((c) => c.testId === "price-bands-chart")!.data;
  assert.deepEqual(bars.slice(0, 6).map((b) => b.label), ["Dưới 5 triệu", "5–10 triệu", "10–20 triệu", "20–50 triệu", "50–100 triệu", "Từ 100 triệu"]);
  const five = new URL(bars[1].href!, "http://x").searchParams;
  assert.equal(five.get("minAmount"), "5000000");
  assert.equal(five.get("maxAmountExclusive"), "10000000");
  const last = bars.find((b) => b.key === "noPrice")!;
  assert.equal(last.href, null);
  assert.match(out, /1 dòng không có giá hợp lệ/);
});

test("the totals shown equal the response total; long labels reach the chart in full (it truncates on the axis and keeps the full text in the tooltip)", () => {
  const long = "Vòng ngọc bích cẩm thạch loại một siêu dài tên sản phẩm đặc biệt";
  reset({ data: response([L({ price: 9_000_000, productName: long })]), loading: false, error: null });
  const out = html();
  assert.ok(out.includes("9.000.000"), "KPI-matching total formatted in VND");
  assert.ok(charts.find((c) => c.testId === "top-products-chart")!.data[0].label.includes(long), "the full label is passed on");
  assert.ok(fmt.truncateLabel(long).length <= 22 && fmt.truncateLabel(long).endsWith("…"));
});

test("narrow screens: the cards stack in one column and nothing forces horizontal overflow", () => {
  reset({ data: response([L({ price: 1_000_000 })]), loading: false, error: null });
  const out = html();
  assert.match(out, /grid grid-cols-1 gap-4 lg:grid-cols-2/);
  assert.match(out, /lg:col-span-2/);
  assert.ok(!/min-w-\[/.test(out), "no fixed minimum width in the sales charts");
});

// ---- F9 -------------------------------------------------------------------------------------------------------------------------------

const inv = {
  range: null,
  held: { count: 5, value: 1_500_000_000, missingPriceCount: 1 },
  remaining: { count: 12, value: 9_500_000_000, missingPriceCount: 0 },
  categories: [
    { category: "Vòng", label: "Vòng", held: { count: 4, value: 1_200_000_000, missingPriceCount: 0 }, remaining: { count: 10, value: 9_000_000_000, missingPriceCount: 0 } },
    { category: "Phí kiểm định", label: "Phí kiểm định", held: { count: 1, value: 300_000_000, missingPriceCount: 1 }, remaining: { count: 0, value: 0, missingPriceCount: 0 } },
    { category: null, label: "Chưa phân loại", held: { count: 0, value: 0, missingPriceCount: 0 }, remaining: { count: 2, value: 500_000_000, missingPriceCount: 0 } },
  ],
};
const invHtml = () => renderToStaticMarkup(createElement(InventoryAnalytics));

test("F9 reads ONE current-state request with no date, takes no date prop, and is labelled 'Tồn kho hiện tại'", () => {
  reset({ data: inv, loading: false, error: null });
  const out = invHtml();
  assert.deepEqual(urls, ["/api/reports/analytics/inventory"], "no start / end - inventory ignores the Dashboard date filter");
  assert.equal(InventoryAnalytics.length, 0, "the component has no range input at all");
  assert.match(out, /Tồn kho hiện tại/);
  assert.match(out, /Không phụ thuộc bộ lọc ngày/);
});

test("F9 KPI summaries show quantity AND value for Held and Remaining; the table gives each category's exact quantity and value", () => {
  reset({ data: inv, loading: false, error: null });
  const out = invHtml();
  const held = out.match(/data-testid="inventory-kpi-held"[\s\S]*?<\/div>/)![0];
  assert.match(held, /Hàng đang giữ/);
  assert.match(held, /1\.500\.000\.000/);
  assert.match(held, /5 sản phẩm/);
  const rem = out.match(/data-testid="inventory-kpi-remaining"[\s\S]*?<\/div>/)![0];
  assert.match(rem, /9\.500\.000\.000/);
  assert.match(rem, /12 sản phẩm/);
  assert.match(out, /4 · 1\.200\.000\.000/);
  assert.match(out, /10 · 9\.000\.000\.000/);
});

test("F9 drill-down: each non-zero cell links to the Inventory report with the exact view and category (uncategorized -> uncategorized=1); no date; zero cells are not links", () => {
  reset({ data: inv, loading: false, error: null });
  const out = invHtml();
  const hrefs = [...out.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const parsed = hrefs.map((h) => new URL(h, "http://x"));
  assert.equal(parsed.length, 4, "4 non-zero cells: Vòng held + remaining, Phí kiểm định held, Chưa phân loại remaining; the 2 zero cells have no link");
  for (const u of parsed) {
    assert.equal(u.pathname, "/reports/inventory");
    assert.ok(["held", "remaining"].includes(u.searchParams.get("view")!));
    assert.equal(u.searchParams.get("dateFrom"), null);
    assert.equal(u.searchParams.get("start"), null);
  }
  assert.ok(parsed.some((u) => u.searchParams.get("view") === "held" && u.searchParams.get("category") === "Vòng"));
  assert.ok(parsed.some((u) => u.searchParams.get("view") === "remaining" && u.searchParams.get("uncategorized") === "1" && u.searchParams.get("category") === null));
  assert.ok(!parsed.some((u) => u.searchParams.get("view") === "remaining" && u.searchParams.get("category") === "Phí kiểm định"), "Phí kiểm định has 0 remaining: no link");
});

test("F9 discloses unpriced products (counted, not valued) and never mentions cost or profit", () => {
  reset({ data: inv, loading: false, error: null });
  const out = invHtml();
  assert.match(out, /1 sản phẩm chưa có giá bán/);
  assert.doesNotMatch(out, /giá vốn|lợi nhuận|cost|profit/i);
});

test("F9 states: loading skeleton, error alert, empty text; the table scrolls inside its own box on a narrow screen", () => {
  reset({ data: null, loading: true, error: null });
  assert.match(invHtml(), /data-skeleton/);
  reset({ data: null, loading: false, error: "Không tải được dữ liệu (500)" });
  assert.match(invHtml(), /role="alert"/);
  reset({ data: { range: null, held: { count: 0, value: 0, missingPriceCount: 0 }, remaining: { count: 0, value: 0, missingPriceCount: 0 }, categories: [] }, loading: false, error: null });
  assert.match(invHtml(), /Hiện không có sản phẩm đang giữ hoặc còn lại\./);
  reset({ data: inv, loading: false, error: null });
  const out = invHtml();
  assert.match(out, /class="mt-3 overflow-x-auto" data-testid="inventory-table-wrap"/);
});

// ---- helpers & page wiring ------------------------------------------------------------------------------------------------------------

test("chart helpers: axis money format, label truncation (Vietnamese / multi-byte safe), height floor, percent", () => {
  assert.equal(fmt.compactMoney(1_250_000_000), "1,3 tỷ");
  assert.equal(fmt.compactMoney(450_000_000), "450 tr");
  assert.equal(fmt.compactMoney(12_000), "12 k");
  assert.equal(fmt.truncateLabel("Vòng", 22), "Vòng");
  assert.equal(Array.from(fmt.truncateLabel("Đ".repeat(40), 10)).length, 10);
  assert.ok(fmt.truncateLabel("𠮷".repeat(30), 5).endsWith("…"));
  assert.equal(fmt.barChartHeight(0), 120);
  assert.equal(fmt.barChartHeight(1), 120);
  assert.ok(fmt.barChartHeight(11) > fmt.barChartHeight(5));
  assert.equal(fmt.formatShare(0.5), "50%");
});

test("the Dashboard page still mounts every Wave A region, in order, and adds the Wave B regions after them", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "app/dashboard/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  const at = (needle: string) => src.indexOf(needle);
  const order = ["<PeriodComparison ", "<SalesTrendChart ", "<SalesCompositionCharts ", "<InventoryAnalytics />"].map(at);
  assert.ok(order.every((i) => i > 0), "all four regions are mounted");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "Wave A first (comparison, trend), then Wave B");
  assert.ok(src.includes("canViewCostAndProfit={canViewCostAndProfit}"), "the Wave A trend keeps its permission prop");
  assert.ok(!/<SalesCompositionCharts[^>]*canViewCostAndProfit|<InventoryAnalytics[^>]*canViewCostAndProfit/.test(src), "Wave B regions take no cost / profit input at all");
});
