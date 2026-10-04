import test from "node:test";
import assert from "node:assert/strict";
import { buildSavePayload, moveKey, normalizeColumnPreference } from "./normalize";
import { AVAILABILITY_TOKENS, ColumnMeta } from "./types";
import { REPORT_COLUMNS, REPORT_KEYS, isReportKey } from "./registry";

const DEFS: ColumnMeta[] = [
  { key: "a", label: "A", mandatory: true },
  { key: "b", label: "B" },
  { key: "c", label: "C" },
  { key: "d", label: "D", availableWhen: "cost_profit" },
  { key: "e", label: "E", mandatory: true },
];

const run = (v: unknown, o: unknown, ctx = {}) => normalizeColumnPreference(DEFS, v, o, ctx);

test("1. no stored preference: all available columns visible in default order", () => {
  const r = run(null, null);
  assert.deepEqual(r.order, ["a", "b", "c", "e"]);
  assert.deepEqual(r.columns, ["a", "b", "c", "e"]);
});

test("2. malformed visible_columns falls back to default visibility", () => {
  for (const bad of ["x", 5, {}, undefined]) assert.deepEqual(run(bad, ["e", "c", "b", "a"]).columns, ["e", "c", "b", "a"]);
});

test("3. malformed column_order falls back to default order and legacy visibility", () => {
  const r = run(["a", "c", "e"], "nope");
  assert.deepEqual(r.order, ["a", "b", "c", "e"]);
  assert.deepEqual(r.columns, ["a", "c", "e"]);
});

test("4. unknown / deleted column ids are ignored", () => {
  const r = run(["a", "ghost", "b", "e"], ["ghost", "b", "a", "e", "c"]);
  assert.deepEqual(r.order, ["b", "a", "e", "c"]);
  assert.deepEqual(r.columns, ["b", "a", "e"]);
});

test("5. duplicate ids keep the first occurrence", () => {
  const r = run(["a", "b", "b", "e"], ["c", "c", "a", "b", "a", "e"]);
  assert.deepEqual(r.order, ["c", "a", "b", "e"]);
});

test("6. a column missing from the order is appended in default order", () => {
  assert.deepEqual(run(["a", "b", "c", "e"], ["e", "a"]).order, ["e", "a", "b", "c"]);
});

test("7. new format: a column unknown at save time is NEW and visible", () => {
  // saved when only a,b,e existed; user hid b. c was introduced later.
  const r = run(["a", "e"], ["a", "b", "e"]);
  assert.deepEqual(r.columns, ["a", "e", "c"].filter((k) => r.order.includes(k)).sort((x, y) => r.order.indexOf(x) - r.order.indexOf(y)));
  assert.ok(r.visible.has("c"), "new column visible");
  assert.ok(!r.visible.has("b"), "column the user hid stays hidden");
});

test("8. legacy row (column_order NULL): unlisted columns stay hidden, exactly as before Wave B", () => {
  const r = run(["a", "e"], null);
  assert.ok(!r.visible.has("b") && !r.visible.has("c"));
});

test("9. mandatory columns are forced visible, but reorderable", () => {
  const r = run(["b"], ["b", "a", "c", "e"]);
  assert.ok(r.visible.has("a") && r.visible.has("e"));
  assert.deepEqual(r.columns, ["b", "a", "e"].sort((x, y) => r.order.indexOf(x) - r.order.indexOf(y)));
});

test("10. hiding every optional column is allowed", () => {
  assert.deepEqual(run(["a", "e"], ["a", "b", "c", "e"]).columns, ["a", "e"]);
});

test("11. empty visible result restores mandatory columns", () => {
  assert.deepEqual(run([], ["a", "b", "c", "e"]).columns, ["a", "e"]);
});

test("11b. a report with no mandatory column and nothing visible falls back to all available", () => {
  const defs: ColumnMeta[] = [{ key: "x", label: "X" }, { key: "y", label: "Y" }];
  assert.deepEqual(normalizeColumnPreference(defs, [], ["x", "y"], {}).columns, ["x", "y"]);
});

test("12. permission-unavailable column is neither shown nor in the effective order", () => {
  const r = run(["a", "d", "e"], ["d", "a", "e", "b", "c"]);
  assert.ok(!r.order.includes("d") && !r.visible.has("d"));
  const r2 = run(["a", "d", "e"], ["d", "a", "e", "b", "c"], { cost_profit: true });
  assert.ok(r2.order.includes("d") && r2.visible.has("d"));
});

test("13. pure: does not mutate its inputs and is repeatable", () => {
  const v = ["a", "b", "b"], o = ["c", "a"];
  const snapshot = JSON.stringify([v, o]);
  const first = run(v, o);
  const second = run(v, o);
  assert.equal(JSON.stringify([v, o]), snapshot);
  assert.deepEqual(first, second);
});

test("14. a row saved by an older build (fewer columns) normalizes correctly", () => {
  const r = run(["a", "b", "e"], ["a", "b", "e"]);
  assert.ok(r.visible.has("c"), "c did not exist then, so it is new and visible");
});

test("save payload keeps stored keys of currently unavailable columns", () => {
  const p = buildSavePayload(DEFS, {}, ["b", "a", "c", "e"], new Set(["a", "b", "e"]), ["a", "d", "e"], ["d", "a", "e"]);
  assert.deepEqual(p.visibleColumns, ["b", "a", "e", "d"]);
  assert.deepEqual(p.columnOrder, ["b", "a", "c", "e", "d"]);
  // round trip: once available again the preserved column returns where it was stored
  const back = normalizeColumnPreference(DEFS, p.visibleColumns, p.columnOrder, { cost_profit: true });
  assert.ok(back.visible.has("d"));
});

test("moveKey moves and clamps", () => {
  assert.deepEqual(moveKey(["a", "b", "c"], "c", 0), ["c", "a", "b"]);
  assert.deepEqual(moveKey(["a", "b", "c"], "a", 99), ["b", "c", "a"]);
  assert.deepEqual(moveKey(["a", "b", "c"], "zzz", 1), ["a", "b", "c"]);
});

test("registry: 35 reports, unique non-empty column ids, valid tokens, stable id format", () => {
  assert.equal(REPORT_KEYS.length, 35);
  assert.ok(isReportKey("data_verification") && !isReportKey("consignments") && !isReportKey("__proto__"));
  for (const rk of REPORT_KEYS) {
    const cols = REPORT_COLUMNS[rk] as readonly ColumnMeta[];
    const keys = cols.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length, `${rk} has duplicate column ids`);
    assert.ok(cols.some((c) => c.mandatory), `${rk} has a mandatory column`);
    for (const c of cols) {
      assert.match(c.key, /^[A-Za-z][A-Za-z0-9_.]{0,63}$/, `${rk}.${c.key}`);
      assert.ok(c.label.length > 0);
      if (c.availableWhen) assert.ok(AVAILABILITY_TOKENS.includes(c.availableWhen));
      assert.ok(!(c.mandatory && c.availableWhen), `${rk}.${c.key}: mandatory column must always be available`);
    }
  }
});

test("registry keeps the column ids already stored in the database", () => {
  const ids = (k: keyof typeof REPORT_COLUMNS) => (REPORT_COLUMNS[k] as readonly ColumnMeta[]).map((c) => c.key);
  assert.deepEqual(ids("customer_receivable"), ["customer", "orderNumber", "orderDate", "totalAmount", "amountPaid", "balance", "status", "paymentMethods", "lastPaymentDate"]);
  assert.equal(ids("sales_ledger").length, 14);
  assert.equal(ids("monthly_sold_products").length, 16);
});
