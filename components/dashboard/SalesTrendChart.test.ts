import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SalesTrendChart from "./SalesTrendChart";
import { TREND_GRANULARITIES } from "@/lib/reports/analytics/buckets";

// Dashboard Wave A UX fix - the trend metric is a visible, labelled button group (was an unlabelled dropdown). Presentation only:
// server-side rendering shows the initial state, so these tests pin the structure, the default and the role-based options.
// Click -> request wiring is covered by the Dev UAT run.

const render = (canViewCostAndProfit: boolean) =>
  renderToStaticMarkup(createElement(SalesTrendChart, { range: null, ready: false, canViewCostAndProfit }));

const METRICS = ["totalOrderValue", "sold", "recognizedRevenue", "grossProfit"] as const;
const pressed = (html: string, id: string) => new RegExp(`aria-pressed="(true|false)"[^>]*data-testid="${id}"`).exec(html)?.[1];

test("Owner/Manager: all four metrics are visible buttons, with a visible caption, and no dropdown", () => {
  const html = render(true);
  for (const m of METRICS) assert.ok(html.includes(`data-testid="trend-metric-${m}"`), m);
  assert.ok(html.includes("Chỉ số"));
  assert.ok(html.includes('aria-labelledby="trend-metric-caption"'));
  assert.ok(!html.includes("<select"));
  for (const label of ["Tổng giá trị đơn hàng", "Đã bán", "Doanh thu đã ghi nhận", "Lợi nhuận gộp"]) assert.ok(html.includes(label), label);
});

test("the default metric stays recognizedRevenue and it is the only pressed metric button", () => {
  const html = render(true);
  assert.equal(pressed(html, "trend-metric-recognizedRevenue"), "true");
  for (const m of ["totalOrderValue", "sold", "grossProfit"]) assert.equal(pressed(html, `trend-metric-${m}`), "false", m);
  assert.ok(/aria-pressed="true"[^>]*data-testid="trend-metric-recognizedRevenue"[^>]*class="[^"]*font-semibold/.test(html), "selected metric is visually distinct");
});

test("unauthorised role (no cost/profit): gross profit is not offered; the other three are", () => {
  const html = render(false);
  assert.ok(!html.includes("trend-metric-grossProfit"));
  assert.ok(!html.includes("Lợi nhuận gộp"));
  for (const m of ["totalOrderValue", "sold", "recognizedRevenue"]) assert.ok(html.includes(`data-testid="trend-metric-${m}"`), m);
  assert.equal(pressed(html, "trend-metric-recognizedRevenue"), "true");
});

test("all five granularities are still offered for both audiences", () => {
  assert.equal(TREND_GRANULARITIES.length, 5);
  for (const can of [true, false]) {
    const html = render(can);
    for (const g of TREND_GRANULARITIES) assert.ok(html.includes(`data-testid="trend-granularity-${g}"`), `${can}:${g}`);
    assert.ok(html.includes('aria-labelledby="trend-granularity-caption"'));
  }
});

test("the metric group wraps (no horizontal overflow on a narrow screen)", () => {
  assert.ok(/role="group"[^>]*class="[^"]*flex-wrap[^"]*"[^>]*data-testid="trend-metric"/.test(render(true)));
});
