import { test } from "node:test";
import assert from "node:assert/strict";
import {
  METRIC_LABELS,
  groupRecognizedByOrder,
  inventoryPageHref,
  parseInventoryView,
  parseSalesMetric,
  parseSalesView,
  rangeParams,
  reconcile,
  salesDetailApiUrl,
  salesPageHref,
  supportsProductView,
} from "./overviewUi";

const JULY = { start: "2026-07-01", end: "2026-08-01" };

test("labels: exactly the eight approved names, all distinct, and never 'Tổng doanh thu'", () => {
  const values = Object.values(METRIC_LABELS);
  assert.deepEqual(values, [
    "Tổng giá trị đơn hàng", "Doanh thu đã ghi nhận", "Giá trị chưa ghi nhận", "Đã bán",
    "Hàng đang giữ", "Hàng còn lại", "Giá vốn", "Lợi nhuận gộp",
  ]);
  assert.equal(new Set(values).size, values.length);
  assert.ok(!values.includes("Tổng doanh thu" as never));
});

test("drill-down URL carries the SAME start/end the Overview used (end exclusive); all-time = no params", () => {
  assert.equal(salesDetailApiUrl("order-value", JULY, "orders"), "/api/reports/overview/order-value?start=2026-07-01&end=2026-08-01&view=orders");
  assert.equal(salesDetailApiUrl("order-value", JULY, "products"), "/api/reports/overview/order-value?start=2026-07-01&end=2026-08-01&view=products");
  assert.equal(salesDetailApiUrl("recognized-revenue", JULY, "orders"), "/api/reports/overview/recognized-revenue?start=2026-07-01&end=2026-08-01");
  assert.equal(salesDetailApiUrl("unrecognized", null, "orders"), "/api/reports/overview/unrecognized?view=orders");
  assert.equal(salesDetailApiUrl("unrecognized", null, "products"), "/api/reports/overview/unrecognized?view=products");
  assert.equal(salesDetailApiUrl("sold", JULY, "products"), "/api/reports/overview/sold?start=2026-07-01&end=2026-08-01&view=products");
  assert.equal(salesDetailApiUrl("sold", null, "orders"), "/api/reports/overview/sold?view=orders");
  assert.equal(rangeParams(null).toString(), "");
});

test("page links never embed a date (the shared Global Date Filter is the single date context)", () => {
  assert.equal(salesPageHref("unrecognized"), "/reports/sales?metric=unrecognized");
  assert.equal(salesPageHref("sold", "products"), "/reports/sales?metric=sold&view=products");
  assert.equal(inventoryPageHref("remaining"), "/reports/inventory?view=remaining");
});

test("query parsing falls back safely and never invents a metric", () => {
  assert.equal(parseSalesMetric("sold"), "sold");
  assert.equal(parseSalesMetric("revenue"), "order-value");
  assert.equal(parseSalesMetric(null), "order-value");
  assert.equal(parseSalesView("products"), "products");
  assert.equal(parseSalesView("x"), "orders");
  assert.equal(parseInventoryView("remaining"), "remaining");
  assert.equal(parseInventoryView(undefined), "held");
});

test("Phase 1.5A: the product view is offered for every Sales metric", () => {
  assert.deepEqual(
    (["order-value", "recognized-revenue", "unrecognized", "sold"] as const).map(supportsProductView),
    [true, true, true, true]
  );
});

test("groupRecognizedByOrder: regroups without changing any amount; legacy rows stay separate", () => {
  const rows = [
    { order_id: "o1", order_number: "A", recognition_date: "2026-07-02", customer_name: "X", amount: 10, rule_label: "BR-001" },
    { order_id: "o1", order_number: "A", recognition_date: "2026-07-02", customer_name: "X", amount: 5, rule_label: "BR-001" },
    { order_id: null, order_number: null, recognition_date: "2026-07-03", customer_name: "Y", amount: 7, rule_label: "BR-002" },
    { order_id: null, order_number: null, recognition_date: "2026-07-04", customer_name: "Z", amount: 3, rule_label: "BR-002" },
  ];
  const g = groupRecognizedByOrder(rows);
  assert.equal(g.length, 3);
  assert.equal(g[0].lines, 2);
  assert.equal(g[0].amount, 15);
  assert.equal(g.reduce((s, x) => s + x.amount, 0), rows.reduce((s, x) => s + x.amount, 0));
  assert.equal(g.reduce((s, x) => s + x.lines, 0), rows.length);
});

test("reconcile reports match / mismatch / pending and never adjusts a number", () => {
  assert.equal(reconcile(782122222, 782122222), "match");
  assert.equal(reconcile(782122222, 740122222), "mismatch");
  assert.equal(reconcile(null, 1), "pending");
  assert.equal(reconcile(1, null), "pending");
});
