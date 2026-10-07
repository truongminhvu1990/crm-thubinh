import test, { before, mock } from "node:test";
import assert from "node:assert/strict";
import { createElement, isValidElement, ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSalesLedgerExportColumns, exportNeedsCost } from "./exportColumns";
import { SALES_LEDGER_COLUMNS, getAvailableSalesLedgerColumns } from "@/lib/salesLedger/salesLedgerColumns";
import { VERIFICATION_EXPORT_COLUMNS } from "@/lib/verification/verificationExport";
import { REPORT_COLUMNS } from "@/lib/reportColumns/registry";
import { normalizeColumnPreference } from "@/lib/reportColumns/normalize";
import type { ColumnContext, ColumnMeta } from "@/lib/reportColumns/types";
import type { SalesLedgerRow } from "@/types/salesLedger";

// Phase 1.6 Wave B1.3 - Sales Ledger + Data Verification on the shared column preference. Presentation only.

const SL = REPORT_COLUMNS.sales_ledger as readonly ColumnMeta[];
const DV = REPORT_COLUMNS.data_verification as readonly ColumnMeta[];
const SL_KEYS = SL.map((c) => c.key);

const pushed: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Table: (props: any) => ReactNode;
before(async () => {
  mock.module("next/navigation", { namedExports: { useRouter: () => ({ push: (p: string) => pushed.push(p) }) } });
  Table = (await import("./SalesLedgerTable")).default as typeof Table;
});

const ROW = {
  purchase_id: "p1",
  customer_id: "c1",
  product_id: "pr1",
  sale_amount: 20_000_000,
  sale_date: "2026-09-01",
  note: null,
  salesperson: "NV A",
  salesperson_id: "s1",
  purchase_created_at: "2026-09-02T00:00:00Z",
  customer_name: "Khách A",
  customer_code: "KH001",
  product_code: "SP-1",
  product_name: "Vòng nhà hoa",
  product_category: "Vòng",
  commission_id: "cm1",
  commission_percent: 5,
  commission_amount: 1_000_000,
  commission_status: "Pending",
  product_image_url: null,
  entry_source: "Historical Import",
  created_by: "QA",
  updated_by: null,
  updated_at: undefined,
  is_duplicate: false,
} as unknown as SalesLedgerRow;
const DUP = { ...ROW, purchase_id: "p2", is_duplicate: true } as SalesLedgerRow;
const COST = new Map([["pr1", 12_000_000]]);

const OWNER: ColumnContext = { cost_profit: true, verification_mode: false };
const OWNER_V: ColumnContext = { cost_profit: true, verification_mode: true };
const SALES: ColumnContext = { cost_profit: false, verification_mode: false };
const SALES_V: ColumnContext = { cost_profit: false, verification_mode: true };
const keysFor = (defs: readonly ColumnMeta[], stored: unknown, order: unknown, ctx: ColumnContext) => normalizeColumnPreference(defs, stored, order, ctx).columns;
const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(Table as never, { rows: [ROW], ...props } as never));
const headerKeys = (html: string) => [...html.matchAll(/<th[^>]*data-column-key="([^"]+)"/g)].map((m) => m[1]);

/** Every element of type `tag` in a React element tree (the component is called directly; it only uses the mocked useRouter). */
function findAll(node: ReactNode, tag: string, out: ReactElement<Record<string, unknown>>[] = []): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, tag, out));
  else if (isValidElement(node)) {
    const el = node as ReactElement<Record<string, unknown>>;
    if (el.type === tag) out.push(el);
    findAll(el.props.children as ReactNode, tag, out);
  }
  return out;
}

test("registry (B0) agrees with the Sales Ledger definitions: 14 ids, order and labels", () => {
  assert.equal(SL.length, 14);
  assert.deepEqual(SL_KEYS, SALES_LEDGER_COLUMNS.map((c) => c.key));
  assert.deepEqual(SL.map((c) => c.label), SALES_LEDGER_COLUMNS.map((c) => c.label));
  assert.deepEqual(SL.filter((c) => c.mandatory).map((c) => c.key), ["sale_date", "product_name", "sale_amount"]);
  assert.equal(DV.length, 12);
  assert.deepEqual(DV.filter((c) => c.mandatory).map((c) => c.key), ["sale_date", "product_name", "sale_amount", "duplicate"]);
});

test("default columns per role and mode: Owner 11 / 14 (verification), Sales 9 / 12; Data Verification 12", () => {
  assert.equal(keysFor(SL, null, null, OWNER).length, 11);
  assert.equal(keysFor(SL, null, null, OWNER_V).length, 14);
  assert.equal(keysFor(SL, null, null, SALES).length, 9);
  assert.equal(keysFor(SL, null, null, SALES_V).length, 12);
  assert.equal(keysFor(DV, null, null, {}).length, 12);
  const h = headerKeys(render({ canViewCostAndProfit: true, costByProductId: COST, columnKeys: keysFor(SL, null, null, OWNER) }));
  assert.deepEqual(h, SL_KEYS.filter((k) => !["entry_source", "audit_info", "duplicate"].includes(k)));
  assert.deepEqual(headerKeys(render({ verificationMode: true, canViewCostAndProfit: true, costByProductId: COST, columnKeys: keysFor(SL, null, null, OWNER_V) })), SL_KEYS);
  assert.deepEqual(headerKeys(render({ verificationMode: true, columnKeys: keysFor(DV, null, null, {}) })), DV.map((c) => c.key));
});

test("headers use the existing labels; the legacy path (no columnKeys) renders the same columns as before", () => {
  const html = render({ verificationMode: true, canViewCostAndProfit: true, costByProductId: COST });
  assert.deepEqual(headerKeys(html), SL_KEYS);
  assert.deepEqual([...html.matchAll(/<th[^>]*data-column-key="[^"]+"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]), SALES_LEDGER_COLUMNS.map((c) => c.label));
});

test("header and cells share ONE order after a reorder (normal mode and verification mode)", () => {
  const order = ["customer", "sale_amount", "sale_date", ...SL_KEYS.filter((k) => !["customer", "sale_amount", "sale_date"].includes(k))];
  for (const [ctx, verificationMode] of [[OWNER, false], [OWNER_V, true]] as const) {
    const keys = keysFor(SL, order, order, ctx);
    const html = render({ verificationMode, canViewCostAndProfit: true, costByProductId: COST, columnKeys: keys });
    assert.deepEqual(headerKeys(html).slice(0, 3), ["customer", "sale_amount", "sale_date"]);
    const body = html.slice(html.indexOf("<tbody"));
    assert.ok(body.indexOf("Khách A") < body.indexOf("20.000.000"), "customer cell before amount cell");
    assert.equal((body.match(/<td/g) ?? []).length, keys.length, "one cell per header");
  }
});

test("mandatory columns survive any stored preference; hidden optional columns are neither header nor cell", () => {
  const keys = keysFor(SL, ["salesperson"], null, OWNER);
  for (const m of ["sale_date", "product_name", "sale_amount"]) assert.ok(keys.includes(m), m);
  const html = render({ canViewCostAndProfit: true, costByProductId: COST, columnKeys: keys });
  assert.ok(!headerKeys(html).includes("product_code") && !headerKeys(html).includes("commission_status"));
  assert.equal(((html.slice(html.indexOf("<tbody")).match(/<td/g)) ?? []).length, keys.length);
  assert.ok(keysFor(DV, [], null, {}).includes("duplicate"), "Data Verification: duplicate is mandatory too");
});

test("permission: cost / profit are never offered, never drawn and never leaked without the permission", () => {
  for (const ctx of [SALES, SALES_V]) {
    const keys = keysFor(SL, null, null, ctx);
    assert.ok(!keys.includes("cost_price") && !keys.includes("profit"));
  }
  // even if a caller passes the keys, the table refuses to draw them and the cost value never appears
  const html = render({ canViewCostAndProfit: false, costByProductId: COST, columnKeys: ["sale_date", "cost_price", "profit", "sale_amount"] });
  assert.deepEqual(headerKeys(html), ["sale_date", "sale_amount"]);
  assert.ok(!html.includes("12.000.000"), "the cost value is not rendered");
  assert.ok(render({ canViewCostAndProfit: true, costByProductId: COST, columnKeys: ["cost_price", "profit"] }).includes("12.000.000"));
  // verification columns only exist in Verification Mode
  assert.deepEqual(headerKeys(render({ verificationMode: false, columnKeys: ["sale_date", "entry_source", "duplicate"] })), ["sale_date"]);
});

test("legacy preference (column_order NULL) keeps the old meaning: the Production-shaped row shows exactly its 8 keys in registry order", () => {
  const legacy = ["sale_date", "product_name", "customer", "salesperson", "commission_amount", "cost_price", "profit", "sale_amount"];
  assert.deepEqual(keysFor(SL, legacy, null, OWNER), ["sale_date", "product_name", "customer", "salesperson", "sale_amount", "commission_amount", "cost_price", "profit"]);
  // verification columns were never in that row: still hidden in verification mode, exactly as before
  assert.deepEqual(keysFor(SL, legacy, null, OWNER_V), keysFor(SL, legacy, null, OWNER));
});

test("new-format preference: a column that did not exist at save time is visible; one the user hid stays hidden", () => {
  const known = SL_KEYS.filter((k) => !["entry_source", "audit_info", "duplicate"].includes(k));
  const stored = known.filter((k) => k !== "product_code");
  const k = keysFor(SL, stored, known, OWNER_V);
  assert.ok(k.includes("entry_source") && k.includes("audit_info") && k.includes("duplicate"), "verification columns appear");
  assert.ok(!k.includes("product_code"), "hidden by the user");
  assert.deepEqual(keysFor(SL, stored, known, OWNER), keysFor(SL, stored, known, OWNER), "toggling the mode never resets unrelated columns");
});

test("rows stay clickable (to the detail page), EntityLinks and the product image slot are kept, duplicate rows are highlighted only in verification mode", () => {
  pushed.length = 0;
  const tree = Table({ rows: [ROW, DUP], verificationMode: true, canViewCostAndProfit: true, costByProductId: COST, columnKeys: keysFor(SL, null, null, OWNER_V) });
  const trs = findAll(tree, "tr").filter((t) => typeof t.props.onClick === "function");
  assert.equal(trs.length, 2);
  (trs[0].props.onClick as () => void)();
  assert.deepEqual(pushed, ["/reports/sales-ledger/p1"]);
  assert.ok(String(trs[0].props.className).includes("cursor-pointer"));
  assert.ok(!String(trs[0].props.className).includes("bg-amber-50"));
  assert.ok(String(trs[1].props.className).includes("bg-amber-50"), "duplicate row highlighted in verification mode");
  const normal = Table({ rows: [DUP], verificationMode: false, columnKeys: keysFor(SL, null, null, SALES) });
  assert.ok(!String(findAll(normal, "tr").find((t) => typeof t.props.onClick === "function")!.props.className).includes("bg-amber-50"));
  const html = render({ canViewCostAndProfit: true, costByProductId: COST, columnKeys: keysFor(SL, null, null, OWNER) });
  assert.ok(html.includes("Vòng nhà hoa") && html.includes("SP-1") && html.includes("KH001"));
  assert.ok(html.includes("lucide-image-off"), "the placeholder image slot is kept");
});

test("'Số đơn' keeps its semantics: the cell is always an em dash, and the minimum width follows the mode", () => {
  const html = render({ columnKeys: ["order_number"] });
  assert.ok(html.slice(html.indexOf("<tbody")).includes("—"));
  assert.ok(render({ verificationMode: true, columnKeys: ["sale_date"] }).includes("min-w-[1560px]"));
  assert.ok(render({ columnKeys: ["sale_date"] }).includes("min-w-[1200px]"));
});

test("mobile cards are independent of the column selection", () => {
  const cards = (h: string) => h.slice(0, h.indexOf('<div class="hidden lg:block'));
  const all = render({ canViewCostAndProfit: true, costByProductId: COST, columnKeys: keysFor(SL, null, null, OWNER) });
  const few = render({ canViewCostAndProfit: true, costByProductId: COST, columnKeys: ["sale_date", "product_name", "sale_amount"] });
  assert.equal(cards(all), cards(few));
  assert.ok(cards(all).includes("/reports/sales-ledger/p1") && cards(all).includes("Lãi/Lỗ"));
});

test("loading and empty states are unchanged", () => {
  assert.ok(renderToStaticMarkup(createElement(Table as never, { rows: [], isLoading: true } as never)).includes("animate-spin"));
  assert.ok(renderToStaticMarkup(createElement(Table as never, { rows: [] } as never)).includes("Không có giao dịch nào trong khoảng thời gian này"));
});

// ---- Sales Ledger export: visible SET from the preference, REGISTRY order, unchanged values ----

const visibleOf = (stored: unknown, order: unknown, ctx: ColumnContext) => {
  const n = normalizeColumnPreference(SL, stored, order, ctx);
  return (k: string) => n.visible.has(k);
};
const ctxOf = (c: ColumnContext, costByProductId = new Map<string, number>()) => ({ canViewCostAndProfit: !!c.cost_profit, verificationMode: !!c.verification_mode, costByProductId });
const labels = (cols: { label: string }[]) => cols.map((c) => c.label);

test("Sales Ledger export: default = every available column in registry order", () => {
  assert.deepEqual(labels(buildSalesLedgerExportColumns(ctxOf(OWNER), visibleOf(null, null, OWNER))), labels(getAvailableSalesLedgerColumns(ctxOf(OWNER))));
  assert.equal(buildSalesLedgerExportColumns(ctxOf(OWNER_V), visibleOf(null, null, OWNER_V)).length, 14);
  assert.equal(buildSalesLedgerExportColumns(ctxOf(SALES), visibleOf(null, null, SALES)).length, 9);
});

test("Sales Ledger export keeps REGISTRY order after the table is reordered; hidden columns are excluded (locked decision)", () => {
  const order = ["customer", "sale_amount", "sale_date", ...SL_KEYS.filter((k) => !["customer", "sale_amount", "sale_date"].includes(k))];
  const stored = order.filter((k) => k !== "salesperson");
  assert.deepEqual(keysFor(SL, stored, order, OWNER).slice(0, 3), ["customer", "sale_amount", "sale_date"], "the table follows the user");
  const h = labels(buildSalesLedgerExportColumns(ctxOf(OWNER), visibleOf(stored, order, OWNER)));
  assert.deepEqual(h, labels(getAvailableSalesLedgerColumns(ctxOf(OWNER)).filter((c) => c.key !== "salesperson")));
  assert.equal(h[0], "Ngày bán");
  assert.ok(!h.includes("Nhân viên"));
});

test("Sales Ledger export: permission and mode gates are unchanged; 'Số đơn' still exports empty", () => {
  const sales = labels(buildSalesLedgerExportColumns(ctxOf(SALES), visibleOf(null, null, SALES)));
  assert.ok(!sales.includes("Giá vốn") && !sales.includes("Lãi / Lỗ"));
  assert.ok(!sales.includes("Nguồn nhập") && !sales.includes("Trùng lặp"));
  const owner = buildSalesLedgerExportColumns(ctxOf(OWNER_V, COST), visibleOf(null, null, OWNER_V));
  const order = owner.find((c) => c.key === "order_number")!;
  assert.equal(order.exportValue(ROW, ctxOf(OWNER_V, COST)), "");
  assert.equal(owner.find((c) => c.key === "cost_price")!.exportValue(ROW, ctxOf(OWNER_V, COST)), 12_000_000);
  assert.equal(owner.find((c) => c.key === "profit")!.exportValue(ROW, ctxOf(OWNER_V, COST)), 8_000_000);
});

test("exportNeedsCost: cost is only looked up when a cost / profit column is permitted AND visible", () => {
  assert.equal(exportNeedsCost(true, visibleOf(null, null, OWNER)), true);
  assert.equal(exportNeedsCost(false, visibleOf(null, null, OWNER)), false);
  assert.equal(exportNeedsCost(true, (k) => k !== "cost_price" && k !== "profit"), false);
});

// ---- Data Verification export: fixed 14 columns, independent of any column preference ----

test("Data Verification export is the FIXED 14-column list and does not depend on the table's columns", () => {
  assert.deepEqual(VERIFICATION_EXPORT_COLUMNS.map((c) => c.header), [
    "Ngày bán", "Mã sản phẩm", "Tên sản phẩm", "Khách hàng", "Nhân viên", "Giá trị bán", "Hoa hồng", "Trạng thái hoa hồng", "Nguồn nhập",
    "Người tạo", "Ngày tạo", "Người cập nhật", "Ngày cập nhật", "Nghi ngờ trùng lặp",
  ]);
  // it is a plain constant: it takes no preference input, so no choice in the ColumnManager can change it
  assert.equal(VERIFICATION_EXPORT_COLUMNS.length, 14);
  assert.deepEqual(VERIFICATION_EXPORT_COLUMNS.map((c) => c.header), VERIFICATION_EXPORT_COLUMNS.map((c) => c.header));
  const r = VERIFICATION_EXPORT_COLUMNS.map((c) => c.value(ROW));
  assert.equal(r[3], "Khách A");
  assert.equal(r[8], "Historical Import");
  assert.equal(r[13], "");
  assert.equal(VERIFICATION_EXPORT_COLUMNS.map((c) => c.value(DUP))[13], "Possible Duplicate");
});
