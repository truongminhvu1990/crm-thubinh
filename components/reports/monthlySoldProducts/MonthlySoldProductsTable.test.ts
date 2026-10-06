import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MonthlySoldProductsTable from "./MonthlySoldProductsTable";
import { buildMonthlySoldProductsExportColumns } from "./exportColumns";
import { MONTHLY_SOLD_PRODUCTS_COLUMNS, getAvailableMonthlySoldProductsColumns } from "@/lib/monthlySoldProducts/monthlySoldProductsColumns";
import { REPORT_COLUMNS } from "@/lib/reportColumns/registry";
import { normalizeColumnPreference } from "@/lib/reportColumns/normalize";
import type { ColumnContext, ColumnMeta } from "@/lib/reportColumns/types";
import type { MonthlySoldProductRow } from "@/types/monthlySoldProducts";

// Phase 1.6 Wave B1.2 - Monthly Sold Products on the shared column preference. Presentation only.

const DEFS = REPORT_COLUMNS.monthly_sold_products as readonly ColumnMeta[];
const REGISTRY_KEYS = DEFS.map((c) => c.key);
const OWNER: ColumnContext = { owner_or_manager: true };
const STAFF: ColumnContext = {};

const ROW = {
  line_key: "l1",
  purchase_id: "p1",
  order_id: "o1",
  order_status: "Completed",
  payment_status: "Paid",
  recognition: "recognized",
  is_legacy: false,
  sale_date: "2026-09-01",
  order_number: "OD-1",
  product_id: "pr1",
  product_code: "SP-1",
  product_name: "Vòng nhà hoa",
  product_category: "Vòng",
  jade_type: "Băng",
  customer_id: "c1",
  customer_name: "Khách A",
  customer_code: "KH001",
  salesperson: "NV A",
  original_price: 30_000_000,
  discount: 1_000_000,
  final_sale_price: 29_000_000,
  gross_profit: 9_000_000,
  amount_paid: 29_000_000,
  remaining_balance: 0,
  payment_methods: "Cash",
} as unknown as MonthlySoldProductRow;

const keysFor = (stored: unknown, order: unknown, ctx: ColumnContext = OWNER) => normalizeColumnPreference(DEFS, stored, order, ctx).columns;
const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(MonthlySoldProductsTable, { rows: [ROW], ...props } as never));
const headers = (html: string) => [...html.matchAll(/<th[^>]*data-column-key="([^"]+)"[^>]*>([^<]*)<\/th>/g)].map((m) => ({ key: m[1], label: m[2] }));

test("registry: 16 columns, mandatory = order_number / product_name / final_sale_price / recognition, gross_profit is owner_or_manager only", () => {
  assert.equal(DEFS.length, 16);
  assert.deepEqual(DEFS.filter((c) => c.mandatory).map((c) => c.key), ["order_number", "product_name", "final_sale_price", "recognition"]);
  assert.equal(DEFS.find((c) => c.key === "gross_profit")?.availableWhen, "owner_or_manager");
});

test("default order: the 16 registry columns, exactly the current left-to-right order, labels unchanged", () => {
  const h = headers(render({ canViewGrossProfit: true, columnKeys: keysFor(null, null) }));
  assert.deepEqual(h.map((x) => x.key), REGISTRY_KEYS);
  assert.deepEqual(h.map((x) => x.label), DEFS.map((c) => c.label));
  // and the legacy path (no columnKeys) renders the same thing
  assert.deepEqual(headers(render({ canViewGrossProfit: true })).map((x) => x.key), REGISTRY_KEYS);
});

test("the old column definitions and the shared registry agree on ids, order and labels (recognition is the only addition)", () => {
  assert.deepEqual([...MONTHLY_SOLD_PRODUCTS_COLUMNS.map((c) => c.key), "recognition"], REGISTRY_KEYS);
  assert.deepEqual([...MONTHLY_SOLD_PRODUCTS_COLUMNS.map((c) => c.label), "Ghi nhận doanh thu"], DEFS.map((c) => c.label));
});

test("header and cells share ONE order: after a reorder the first body cell belongs to the first header", () => {
  const order = ["customer", "product_name", "sale_date", ...REGISTRY_KEYS.filter((k) => !["customer", "product_name", "sale_date"].includes(k))];
  const html = render({ canViewGrossProfit: true, columnKeys: keysFor(order, order) });
  assert.deepEqual(headers(html).map((x) => x.key).slice(0, 3), ["customer", "product_name", "sale_date"]);
  const body = html.slice(html.indexOf("<tbody"));
  assert.ok(body.indexOf("Khách A") < body.indexOf("Vòng nhà hoa"), "customer cell before product-name cell");
  assert.ok(body.indexOf("Vòng nhà hoa") < body.indexOf("01/09/2026") || body.indexOf("Vòng nhà hoa") < body.indexOf("2026"), "product-name cell before the sale-date cell");
  assert.equal((html.match(/<td/g) ?? []).length, headers(html).length, "one cell per header");
});

test("hidden columns are neither header nor cell; mandatory columns cannot be hidden", () => {
  const html = render({ canViewGrossProfit: true, columnKeys: keysFor(["sale_date"], null) });
  const keys = headers(html).map((x) => x.key);
  for (const m of ["order_number", "product_name", "final_sale_price", "recognition"]) assert.ok(keys.includes(m), m);
  assert.ok(keys.includes("sale_date"));
  for (const hidden of ["product_code", "customer", "gross_profit", "payment_methods"]) assert.ok(!keys.includes(hidden), hidden);
  assert.equal((html.match(/<td/g) ?? []).length, keys.length);
});

test("recognition: always rendered (even if the stored preference lists nothing), with its testid and BR-001 label", () => {
  const html = render({ canViewGrossProfit: false, columnKeys: keysFor([], []) });
  assert.ok(html.includes('data-testid="monthly-sold-products-recognition-cell"'));
  assert.ok(html.includes("Đã ghi nhận"));
  const legacy = renderToStaticMarkup(createElement(MonthlySoldProductsTable, { rows: [{ ...ROW, is_legacy: true }], columnKeys: keysFor(null, null) } as never));
  assert.ok(legacy.includes("Đã ghi nhận (dữ liệu cũ)"), "BR-002 legacy wording unchanged");
  const unrec = renderToStaticMarkup(createElement(MonthlySoldProductsTable, { rows: [{ ...ROW, recognition: "unrecognized", order_status: "Reserved" }], columnKeys: keysFor(null, null) } as never));
  assert.ok(unrec.includes("Chưa ghi nhận — đang cọc"));
});

test("gross_profit: shown for Owner/Manager, never for others - not in the normalized columns and not even if a caller passes it", () => {
  assert.ok(keysFor(null, null, OWNER).includes("gross_profit"));
  assert.ok(!keysFor(null, null, STAFF).includes("gross_profit"));
  const html = render({ canViewGrossProfit: false, columnKeys: ["sale_date", "gross_profit", "recognition"] });
  assert.ok(!headers(html).some((x) => x.key === "gross_profit"), "the table itself refuses a column the viewer may not see");
  assert.ok(!html.includes("9.000.000"), "the profit value is not rendered");
  assert.ok(render({ canViewGrossProfit: true, columnKeys: ["gross_profit"] }).includes("9.000.000"));
});

test("legacy preference (column_order NULL): unlisted columns stay hidden, default order, mandatory forced", () => {
  assert.deepEqual(keysFor(["product_code", "customer", "salesperson", "final_sale_price", "gross_profit", "sale_date", "amount_paid", "remaining_balance", "payment_methods"], null),
    ["sale_date", "order_number", "product_code", "product_name", "customer", "salesperson", "final_sale_price", "gross_profit", "amount_paid", "remaining_balance", "payment_methods", "recognition"]);
});

test("new-format preference: a column added later is visible; a column the user hid stays hidden", () => {
  const known = REGISTRY_KEYS.filter((k) => k !== "payment_methods"); // saved when payment_methods did not exist yet
  const k = keysFor(known.filter((x) => x !== "jade_type"), known);
  assert.ok(k.includes("payment_methods"), "new column visible");
  assert.ok(!k.includes("jade_type"), "hidden by the user");
});

test("loading and empty states are unchanged", () => {
  assert.ok(renderToStaticMarkup(createElement(MonthlySoldProductsTable, { rows: [], isLoading: true } as never)).includes("animate-spin"));
  assert.ok(renderToStaticMarkup(createElement(MonthlySoldProductsTable, { rows: [] } as never)).includes("Không có sản phẩm nào được bán trong khoảng thời gian này"));
});

// ---- export: visibility from the preference, ORDER stays the registry order, recognition last ----

const exportHeaders = (canView: boolean, isVisible: (k: string) => boolean) => buildMonthlySoldProductsExportColumns(canView, isVisible).map((c) => c.header);
const visibleOf = (stored: unknown, order: unknown, ctx: ColumnContext = OWNER) => {
  const n = normalizeColumnPreference(DEFS, stored, order, ctx);
  return (k: string) => n.visible.has(k);
};

test("export: default = all 15 registry columns in registry order, then 'Ghi nhận doanh thu' last", () => {
  const h = exportHeaders(true, visibleOf(null, null));
  assert.deepEqual(h, [...getAvailableMonthlySoldProductsColumns({ canViewGrossProfit: true }).map((c) => c.label), "Ghi nhận doanh thu"]);
  assert.equal(h.length, 16);
  assert.equal(h[h.length - 1], "Ghi nhận doanh thu");
});

test("export: hidden columns are left out, mandatory ones are always in (visibility comes from the shared preference)", () => {
  const h = exportHeaders(true, visibleOf(["sale_date"], null));
  assert.deepEqual(h, ["Ngày bán", "Số đơn", "Tên sản phẩm", "Giá bán cuối", "Ghi nhận doanh thu"]);
});

test("export keeps REGISTRY order after the user reorders the table (locked decision)", () => {
  const reordered = ["customer", "product_name", "sale_date", ...REGISTRY_KEYS.filter((k) => !["customer", "product_name", "sale_date"].includes(k))];
  const tableOrder = normalizeColumnPreference(DEFS, reordered, reordered, OWNER).columns;
  assert.deepEqual(tableOrder.slice(0, 3), ["customer", "product_name", "sale_date"], "the table did follow the user");
  const h = exportHeaders(true, visibleOf(reordered, reordered));
  assert.deepEqual(h, exportHeaders(true, visibleOf(null, null)), "the export is identical to the default export");
  assert.equal(h[0], "Ngày bán");
  assert.equal(h[h.length - 1], "Ghi nhận doanh thu");
});

test("export: gross_profit only for Owner/Manager; recognition label stays computed per row", () => {
  assert.ok(!exportHeaders(false, visibleOf(null, null, STAFF)).includes("Lãi gộp"));
  assert.ok(exportHeaders(true, visibleOf(null, null)).includes("Lãi gộp"));
  const cols = buildMonthlySoldProductsExportColumns(true, visibleOf(null, null));
  assert.equal(cols[cols.length - 1].value(ROW), "Đã ghi nhận");
  assert.equal(cols[cols.length - 1].width, 30);
});
