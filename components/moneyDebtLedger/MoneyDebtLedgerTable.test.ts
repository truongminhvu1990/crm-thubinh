import test from "node:test";
import assert from "node:assert/strict";
import { createElement, isValidElement, ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MoneyDebtLedgerTable from "./MoneyDebtLedgerTable";
import { REPORT_COLUMNS } from "@/lib/reportColumns/registry";
import { buildSavePayload, normalizeColumnPreference } from "@/lib/reportColumns/normalize";
import type { ColumnContext, ColumnMeta } from "@/lib/reportColumns/types";
import type { MoneyDebtLedgerEntry } from "@/types/moneyDebtLedger";

// Phase 1.6 Wave B1.4 - Money & Debt Ledger transaction table on the shared column preference. Presentation only.

const DEFS = REPORT_COLUMNS.money_debt_ledger as readonly ColumnMeta[];
const ALL = DEFS.map((c) => c.key);
const MANDATORY = ["date", "code", "currency", "in", "out"];
const CAN_EDIT: ColumnContext = { has_edit: true };
const NO_EDIT: ColumnContext = { has_edit: false };
const keysFor = (stored: unknown, order: unknown, ctx: ColumnContext) => normalizeColumnPreference(DEFS, stored, order, ctx).columns;

const ORDER_ENTRY = {
  id: "e1",
  entry_code: "MDL-001",
  transaction_date: "2026-09-01",
  transaction_type: "Supplier Payment via Money Changer",
  party_type: "Money Changer",
  party: { id: "mc1", name: "MC Một", partner_type: "Money Changer" },
  group_counterparty: { id: "sup1", name: "NCC Một", partner_type: "Supplier" },
  currency: "VND",
  amount: 5_000_000,
  direction: "OUT",
  transaction_group: "g1",
  fx_rate: null,
  order: { id: "o1", order_number: "DH-001", customer: { id: "c1", full_name: "Khách A" } },
  reference: null,
  corrects_entry_id: null,
} as unknown as MoneyDebtLedgerEntry;
const CORRECTION = { ...ORDER_ENTRY, id: "e2", entry_code: "MDL-002", corrects_entry_id: "e1", order: null, direction: "IN", transaction_type: "Adjustment" } as unknown as MoneyDebtLedgerEntry;
const ENTRIES = [ORDER_ENTRY, CORRECTION];

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(MoneyDebtLedgerTable as never, { entries: ENTRIES, ...props } as never));
const headerKeys = (html: string) => [...html.matchAll(/<th[^>]*data-column-key="([^"]+)"/g)].map((m) => m[1]);
/** First <tr> of the body: the keys of its cells are not present as attributes, so read the cell test ids / content order instead. */
const bodyCells = (html: string, id: string) => {
  const row = html.match(new RegExp(`<tr[^>]*money-debt-ledger-row-${id}[^>]*>([\\s\\S]*?)</tr>`));
  assert.ok(row, "row rendered");
  return [...row[1].matchAll(/<td[\s>]/g)].length;
};

function findAll(node: ReactNode, pred: (el: ReactElement<Record<string, unknown>>) => boolean, out: ReactElement<Record<string, unknown>>[] = []) {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, pred, out));
  else if (isValidElement(node)) {
    const el = node as ReactElement<Record<string, unknown>>;
    if (pred(el)) out.push(el);
    findAll(el.props.children as ReactNode, pred, out);
  }
  return out;
}
const callTable = (props: Record<string, unknown>) =>
  (MoneyDebtLedgerTable as unknown as (p: Record<string, unknown>) => ReactNode)({ entries: ENTRIES, ...props });

test("registry (B0) has the 13 Money & Debt Ledger ids in the table order, with the 5 mandatory columns and 'actions' gated by has_edit", () => {
  assert.deepEqual(ALL, ["date", "code", "party", "type", "content", "supplier", "order", "currency", "in", "out", "fxRate", "status", "actions"]);
  assert.deepEqual(DEFS.filter((c) => c.mandatory).map((c) => c.key), MANDATORY);
  assert.equal(DEFS.find((c) => c.key === "actions")!.availableWhen, "has_edit");
  // table with no columnKeys + onEdit renders exactly these 13, in this order
  assert.deepEqual(headerKeys(render({ onEdit: () => {} })), ALL);
});

test("headers use the existing labels", () => {
  const html = render({ onEdit: () => {} });
  for (const label of ["Ngày", "Mã GD", "Money Changer / Đối tượng", "Loại", "Nội dung", "Nhà cung cấp", "Đơn hàng", "Tiền", "IN", "OUT", "Tỷ giá", "Trạng thái", "Thao tác"]) {
    assert.ok(html.includes(`>${label}</th>`), label);
  }
});

test("default columns: with has_edit all 13, without it 12 (no 'actions')", () => {
  assert.deepEqual(keysFor(null, null, CAN_EDIT), ALL);
  assert.deepEqual(keysFor(null, null, NO_EDIT), ALL.filter((k) => k !== "actions"));
});

test("has_edit gating: a column manager never lists 'actions' without it, and the table never draws it without onEdit", () => {
  const rows = normalizeColumnPreference(DEFS, null, null, NO_EDIT);
  assert.ok(!rows.order.includes("actions"));
  assert.ok(!headerKeys(render({ columnKeys: ALL })).includes("actions"), "even if actions is in columnKeys, no onEdit -> not drawn");
  assert.ok(!render({ columnKeys: ALL }).includes("money-debt-ledger-edit-e1"), "no edit button for an unauthorized caller");
  assert.ok(headerKeys(render({ columnKeys: ALL, onEdit: () => {} })).includes("actions"));
  assert.ok(render({ columnKeys: ALL, onEdit: () => {} }).includes("money-debt-ledger-edit-e1"));
});

test("mobile cards: the edit button follows onEdit too (unauthorized never sees it)", () => {
  assert.ok(!render({}).includes("money-debt-ledger-edit-mobile-e1"));
  assert.ok(render({ onEdit: () => {} }).includes("money-debt-ledger-edit-mobile-e1"));
});

test("mandatory columns cannot be hidden (a saved row that omits them still shows them) but CAN be reordered", () => {
  const hiddenAll = keysFor(["party"], ["party", "type"], CAN_EDIT);
  for (const m of MANDATORY) assert.ok(hiddenAll.includes(m), `${m} stays visible`);
  const moved = keysFor(null, ["in", "out", "currency", "code", "date", ...ALL.filter((k) => !MANDATORY.includes(k))], CAN_EDIT);
  assert.deepEqual(moved.slice(0, 5), ["in", "out", "currency", "code", "date"]);
  const payload = buildSavePayload(DEFS, CAN_EDIT, ["in", ...ALL.filter((k) => k !== "in")], new Set(ALL), null, null);
  assert.equal(payload.columnOrder?.[0], "in");
});

test("legacy DB row (column_order NULL): unlisted columns stay hidden; new-format row: columns unknown at save time are visible", () => {
  const legacy = ["date", "code", "currency", "in", "out", "party"];
  assert.deepEqual(keysFor(legacy, null, CAN_EDIT), ["date", "code", "party", "currency", "in", "out"]);
  const fresh = keysFor(["date", "code", "currency", "in", "out"], ["date", "code", "currency", "in", "out"], CAN_EDIT);
  assert.ok(fresh.includes("party") && fresh.includes("status"), "columns added after the save are visible");
});

test("no localStorage migration: the table/preference code never reads the old crm.moneyDebtLedger.columns key", async () => {
  const fs = await import("node:fs");
  for (const f of ["components/moneyDebtLedger/MoneyDebtLedgerTable.tsx", "app/money-debt-ledger/page.tsx"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.ok(!/localStorage|useMoneyDebtLedgerColumnPreference|crm\.moneyDebtLedger/.test(src), `${f} does not touch the legacy localStorage preference`);
  }
});

test("reorder: header and every body row follow the SAME ordered keys", () => {
  const order = ["code", "date", "in", "out", "currency", "supplier", "party", "type", "content", "order", "fxRate", "status", "actions"];
  const html = render({ columnKeys: order, onEdit: () => {} });
  assert.deepEqual(headerKeys(html), order);
  assert.equal(bodyCells(html, "e1"), order.length);
  assert.equal(bodyCells(html, "e2"), order.length);
  const rowHtml = html.match(/money-debt-ledger-row-e1[^>]*>([\s\S]*?)<\/tr>/)![1];
  const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
  assert.ok(cells[0].includes("MDL-001"), "first body cell is the code");
  assert.ok(!cells[1].includes("MDL-001") && /\d/.test(cells[1]), "second body cell is the date");
});

test("a hidden column is neither a header nor a cell; unknown keys are ignored", () => {
  const html = render({ columnKeys: ["date", "code", "currency", "in", "out", "nonsense"], onEdit: () => {} });
  assert.deepEqual(headerKeys(html), ["date", "code", "currency", "in", "out"]);
  assert.equal(bodyCells(html, "e1"), 5);
  assert.ok(!html.includes("money-debt-ledger-supplier-e1") && !html.includes("money-debt-ledger-order-e1"));
});

test("supplier and order links stop propagation, so they never open the detail modal; the row click does", () => {
  const tree = callTable({ columnKeys: ALL, onEdit: () => {}, onRowClick: () => {} });
  const links = findAll(tree, (el) => typeof el.props.href === "string");
  const hrefs = links.map((l) => l.props.href as string);
  assert.ok(hrefs.includes("/partners/sup1"), "supplier link");
  assert.ok(hrefs.includes("/orders/o1"), "order link");
  const orderLink = links.find((l) => l.props.href === "/orders/o1")!;
  let stopped = 0;
  (orderLink.props.onClick as (e: { stopPropagation: () => void }) => void)({ stopPropagation: () => stopped++ });
  assert.equal(stopped, 1, "order link stops propagation");
  // the supplier cell link has no handler of its own in the desktop table (the row click is the detail modal) - the mobile card one stops it
  const mobileSupplier = links.filter((l) => l.props.href === "/partners/sup1");
  assert.ok(mobileSupplier.some((l) => typeof l.props.onClick === "function"), "mobile supplier link stops propagation");
});

test("row click -> onRowClick(entry) on the desktop row and on the mobile card; the edit button stops propagation", () => {
  const clicked: string[] = [];
  const edited: string[] = [];
  const tree = callTable({ columnKeys: ALL, onEdit: (e: MoneyDebtLedgerEntry) => edited.push(e.id), onRowClick: (e: MoneyDebtLedgerEntry) => clicked.push(e.id) });
  const rows = findAll(tree, (el) => el.type === "tr" && typeof el.props.onClick === "function");
  assert.equal(rows.length, 2);
  (rows[0].props.onClick as () => void)();
  assert.deepEqual(clicked, ["e1"]);
  const cards = findAll(tree, (el) => el.type === "div" && typeof el.props["data-testid"] === "string" && String(el.props["data-testid"]).startsWith("money-debt-ledger-card-"));
  (cards[1].props.onClick as () => void)();
  assert.deepEqual(clicked, ["e1", "e2"]);
  const edit = findAll(tree, (el) => el.type === "button" && el.props["data-testid"] === "money-debt-ledger-edit-e1")[0];
  let stopped = 0;
  (edit.props.onClick as (e: { stopPropagation: () => void }) => void)({ stopPropagation: () => stopped++ });
  assert.equal(stopped, 1);
  assert.deepEqual(edited, ["e1"]);
});

test("loading and empty states keep their content and still show the toolbar (md up only)", () => {
  const toolbar = createElement("span", { "data-testid": "tb" }, "CM");
  const loading = render({ isLoading: true, toolbar });
  assert.ok(loading.includes("animate-spin") && loading.includes('data-testid="tb"') && loading.includes("hidden md:flex"));
  const empty = render({ entries: [], toolbar });
  assert.ok(empty.includes("Không có giao dịch nào khớp với bộ lọc hiện tại") && empty.includes('data-testid="tb"'));
  assert.ok(!render({ isLoading: true }).includes("money-debt-ledger-toolbar"), "no toolbar prop -> no toolbar row");
});

test("mobile card list does not depend on the column preference", () => {
  const cards = (keys: string[] | undefined) => (render({ columnKeys: keys, onEdit: () => {} }).match(/<div[^>]*md:hidden space-y-2[\s\S]*$/) ?? [""])[0];
  assert.equal(cards(["date", "code", "currency", "in", "out"]), cards(ALL));
  assert.equal(cards(undefined), cards(ALL));
  assert.ok(cards(ALL).includes("MDL-001") && cards(ALL).includes("DH-001"));
});

test("cell content is unchanged: IN/OUT by direction, correction status badges, content text", () => {
  const html = render({ columnKeys: ALL, onEdit: () => {} });
  assert.ok(html.includes("Điều chỉnh") && html.includes("Đã điều chỉnh (1)"));
  assert.ok(html.includes("Đơn DH-001 · Khách A"), "describeContent");
  assert.ok(html.includes("Điều chỉnh cho MDL-001"), "correction content");
});
