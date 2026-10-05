import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CustomerReceivableTable from "./CustomerReceivableTable";
import { CUSTOMER_RECEIVABLE_COLUMNS } from "@/lib/customerReceivable/customerReceivableColumns";
import { REPORT_COLUMNS } from "@/lib/reportColumns/registry";
import { normalizeColumnPreference } from "@/lib/reportColumns/normalize";
import type { CustomerReceivableRow } from "@/types/customerReceivable";

// Phase 1.6 Wave B1.1 - Customer Receivable on the shared column preference. Presentation only.

const ROW = {
  orderId: "o1",
  orderNumber: "ORD-1",
  orderDate: "2026-09-01",
  customerId: "c1",
  customerName: "Khách A",
  customerCode: "KH001",
  totalAmount: 1_000_000,
  amountPaid: 400_000,
  remainingBalance: 600_000,
  overpaidAmount: 0,
  settlementState: "Outstanding",
  paymentMethods: null,
  lastPaymentDate: null,
  paymentCount: 0,
} as unknown as CustomerReceivableRow;

const registryKeys = (REPORT_COLUMNS.customer_receivable as readonly { key: string }[]).map((c) => c.key);
const labels = (cols: readonly { key: string; label: string }[]) => cols.map((c) => c.label);

function desktopHeaders(html: string): string[] {
  const table = html.slice(html.indexOf("<table"));
  return [...table.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
}

test("registry (B0) and the table's own column definitions agree on ids, order and labels", () => {
  assert.deepEqual(CUSTOMER_RECEIVABLE_COLUMNS.map((c) => c.key), registryKeys);
  assert.deepEqual(labels(CUSTOMER_RECEIVABLE_COLUMNS), labels(REPORT_COLUMNS.customer_receivable as readonly { key: string; label: string }[]));
});

test("default (no preference): the desktop header order is exactly the current order", () => {
  const n = normalizeColumnPreference(REPORT_COLUMNS.customer_receivable, null, null, {});
  const html = renderToStaticMarkup(createElement(CustomerReceivableTable, { rows: [ROW], columnKeys: n.columns as never }));
  assert.deepEqual(desktopHeaders(html), ["Khách hàng", "Đơn hàng", "Ngày đặt", "Tổng tiền", "Đã thanh toán", "Còn lại / Dư", "Trạng thái", "Phương thức thanh toán", "Thanh toán gần nhất"]);
});

test("a saved order and hidden columns drive header AND cells together", () => {
  const n = normalizeColumnPreference(REPORT_COLUMNS.customer_receivable, ["customer", "orderNumber", "balance", "totalAmount"], ["balance", "customer", "orderNumber", "orderDate", "totalAmount", "amountPaid", "status", "paymentMethods", "lastPaymentDate"], {});
  const html = renderToStaticMarkup(createElement(CustomerReceivableTable, { rows: [ROW], columnKeys: n.columns as never }));
  assert.deepEqual(desktopHeaders(html), ["Còn lại / Dư", "Khách hàng", "Đơn hàng", "Tổng tiền"]);
  const firstRow = html.slice(html.indexOf("<tbody"));
  assert.ok(firstRow.indexOf("600.000") < firstRow.indexOf("Khách A"), "balance cell is first, same order as header");
  assert.ok(!firstRow.includes("Phương thức"), "hidden column not rendered");
});

test("mandatory columns survive any stored preference (customer, orderNumber, balance)", () => {
  for (const stored of [[], ["status"], ["orderDate"], "garbage"]) {
    const n = normalizeColumnPreference(REPORT_COLUMNS.customer_receivable, stored, null, {});
    for (const k of ["customer", "orderNumber", "balance"]) assert.ok(n.visible.has(k), `${k} with ${JSON.stringify(stored)}`);
  }
});

test("legacy row (column_order NULL) keeps the old meaning: unlisted columns stay hidden, default order", () => {
  const n = normalizeColumnPreference(REPORT_COLUMNS.customer_receivable, ["customer", "orderNumber", "balance", "status"], null, {});
  assert.deepEqual(n.columns, ["customer", "orderNumber", "balance", "status"]);
});

test("new-format row: a column added later is visible by default", () => {
  const n = normalizeColumnPreference(REPORT_COLUMNS.customer_receivable, ["customer", "orderNumber", "balance"], ["customer", "orderNumber", "balance"], {});
  assert.ok(n.visible.has("orderDate") && n.visible.has("lastPaymentDate"));
});

test("without columnKeys the table still behaves as before (default visibility and order)", () => {
  const html = renderToStaticMarkup(createElement(CustomerReceivableTable, { rows: [ROW] }));
  assert.equal(desktopHeaders(html).length, 9);
});

test("mobile card list is independent of the column selection", () => {
  const all = renderToStaticMarkup(createElement(CustomerReceivableTable, { rows: [ROW] }));
  const few = renderToStaticMarkup(createElement(CustomerReceivableTable, { rows: [ROW], columnKeys: ["customer", "orderNumber", "balance"] }));
  const cards = (h: string) => h.slice(0, h.indexOf("<table"));
  assert.equal(cards(all), cards(few));
  assert.ok(cards(all).includes("ORD-1"));
});
