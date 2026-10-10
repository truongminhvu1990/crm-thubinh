import test from "node:test";
import assert from "node:assert/strict";
import {
  buildComposition,
  categoryOf,
  CompositionLine,
  isUsablePrice,
  lineValue,
  NO_PRICE_BAND,
  PRICE_BANDS,
  priceBandOf,
  TOP_PRODUCTS_LIMIT,
  UNCATEGORIZED_LABEL,
  UNKNOWN_PRODUCT_LABEL,
} from "./composition";

// Dashboard Wave B (F4 / F5 / F8) - the pure grouping of the recognized purchase rows.

const line = (over: Partial<CompositionLine> & { price: unknown }): CompositionLine => ({
  productId: "p1",
  productCode: "SP1",
  productName: "Vòng 1",
  category: "Vòng",
  productFound: true,
  ...over,
});

const sum = (xs: { value: number }[]) => xs.reduce((s, x) => s + x.value, 0);

test("price band edges: lower-inclusive, upper-exclusive, exactly as the Product Owner locked them", () => {
  const cases: [number, string][] = [
    [1, "under5m"],
    [4_999_999, "under5m"],
    [5_000_000, "5to10m"],
    [9_999_999, "5to10m"],
    [10_000_000, "10to20m"],
    [19_999_999, "10to20m"],
    [20_000_000, "20to50m"],
    [49_999_999, "20to50m"],
    [50_000_000, "50to100m"],
    [99_999_999, "50to100m"],
    [100_000_000, "from100m"],
    [880_000_000, "from100m"],
  ];
  for (const [price, band] of cases) assert.equal(priceBandOf(price), band, String(price));
  assert.deepEqual(
    PRICE_BANDS.map((b) => b.label),
    ["Dưới 5 triệu", "5–10 triệu", "10–20 triệu", "20–50 triệu", "50–100 triệu", "Từ 100 triệu"]
  );
  assert.equal(NO_PRICE_BAND.label, "Không có giá");
});

test("a numeric string price is placed like the number (the database may return numeric as text)", () => {
  assert.equal(priceBandOf("5000000"), "5to10m");
  assert.equal(priceBandOf("4999999"), "under5m");
});

test("missing / invalid / non-positive prices go to 'Không có giá' and are never silently dropped from the total", () => {
  for (const bad of [null, undefined, "", "abc", NaN, Infinity, 0, -5_000_000]) {
    assert.equal(isUsablePrice(bad), false, String(bad));
    assert.equal(priceBandOf(bad), "noPrice", String(bad));
  }
  const r = buildComposition([line({ price: 7_000_000 }), line({ price: null }), line({ price: -2_000_000 }), line({ price: "abc" })]);
  const none = r.priceBands.find((b) => b.key === "noPrice");
  assert.ok(none);
  assert.equal(none.count, 3);
  assert.equal(none.value, -2_000_000, "the value a row contributes to the KPI is kept, so the bands still add up to the total");
  assert.equal(sum(r.priceBands), r.total);
  assert.equal(r.total, 5_000_000);
});

test("'Không có giá' is absent when no row needs it; the six real bands are always present", () => {
  const r = buildComposition([line({ price: 12_000_000 })]);
  assert.deepEqual(r.priceBands.map((b) => b.key), ["under5m", "5to10m", "10to20m", "20to50m", "50to100m", "from100m"]);
  assert.equal(r.priceBands.find((b) => b.key === "10to20m")?.value, 12_000_000);
  assert.equal(r.priceBands.find((b) => b.key === "under5m")?.value, 0);
});

test("every row lands in exactly one band and the bands add up to the total", () => {
  const prices = [250_000, 4_999_999, 5_000_000, 9_999_999, 10_000_000, 20_000_000, 49_999_999, 50_000_000, 100_000_000, 880_000_000, null];
  const lines = prices.map((price, i) => line({ price, productId: `p${i}`, productCode: `SP${i}` }));
  const r = buildComposition(lines);
  assert.equal(r.priceBands.reduce((s, b) => s + b.count, 0), lines.length);
  assert.equal(sum(r.priceBands), r.total);
  assert.equal(r.total, prices.reduce<number>((s, p) => s + lineValue(p), 0));
});

test("categories: null / blank / whitespace -> 'Chưa phân loại'; fee and service categories stay visible as their own groups", () => {
  assert.equal(categoryOf(null), null);
  assert.equal(categoryOf(""), null);
  assert.equal(categoryOf("   "), null);
  assert.equal(categoryOf("Vòng"), "Vòng");
  const r = buildComposition([
    line({ price: 100, category: "Vòng" }),
    line({ price: 10, category: "Phí vận chuyển", productId: "f1" }),
    line({ price: 5, category: "Phí kiểm định", productId: "f2" }),
    line({ price: 3, category: "Phí gia công", productId: "f3" }),
    line({ price: 7, category: null, productId: "n1" }),
    line({ price: 8, category: "  ", productId: "n2" }),
  ]);
  const byLabel = Object.fromEntries(r.categories.map((c) => [c.label, c]));
  assert.equal(byLabel["Phí vận chuyển"].value, 10);
  assert.equal(byLabel["Phí kiểm định"].value, 5);
  assert.equal(byLabel["Phí gia công"].value, 3);
  assert.equal(byLabel[UNCATEGORIZED_LABEL].value, 15);
  assert.equal(byLabel[UNCATEGORIZED_LABEL].category, null, "the drill-down filters on null, not on the label");
  assert.equal(sum(r.categories), r.total);
  assert.equal(r.categories[0].label, "Vòng", "ranked by value, descending");
});

test("a product that cannot be found is labelled, grouped as 'Chưa phân loại', and keeps its recognized value", () => {
  const r = buildComposition([
    line({ price: 40, productId: "gone", productFound: false, productCode: null, productName: null, category: null }),
    line({ price: 60, productId: null, productFound: false, productCode: null, productName: null, category: null }),
    line({ price: 100 }),
  ]);
  assert.equal(r.total, 200);
  const unknown = r.topProducts.rows.filter((p) => p.label === UNKNOWN_PRODUCT_LABEL);
  assert.equal(unknown.length, 2, "a missing product id and a dangling one are separate, deterministic groups");
  assert.ok(unknown.every((p) => p.productId === null), "an unknown product has no id to drill into");
  assert.equal(r.categories.find((c) => c.label === UNCATEGORIZED_LABEL)?.value, 100);
  assert.equal(sum(r.topProducts.rows) + r.topProducts.others.value, 200);
});

test("repeated purchases of one product aggregate under that product; distinct products stay apart", () => {
  const r = buildComposition([
    line({ price: 30, productId: "a", productCode: "A", productName: "Alpha" }),
    line({ price: 20, productId: "a", productCode: "A", productName: "Alpha" }),
    line({ price: 40, productId: "b", productCode: "B", productName: "Beta" }),
  ]);
  const a = r.topProducts.rows.find((p) => p.productId === "a");
  assert.equal(a?.value, 50);
  assert.equal(a?.count, 2);
  assert.equal(r.topProducts.rows[0].productId, "a");
  assert.equal(r.topProducts.distinctProducts, 2);
});

test("several items of one order are separate lines of their own product and add up", () => {
  // one order, three different products: the order is not a unit here - each recognized line is.
  const r = buildComposition([
    line({ price: 6_000_000, productId: "x", productCode: "X", category: "Vòng" }),
    line({ price: 12_000_000, productId: "y", productCode: "Y", category: "Nhẫn" }),
    line({ price: 55_000_000, productId: "z", productCode: "Z", category: "Vòng" }),
  ]);
  assert.equal(r.count, 3);
  assert.equal(r.categories.find((c) => c.label === "Vòng")?.value, 61_000_000);
  assert.equal(r.priceBands.find((b) => b.key === "5to10m")?.count, 1);
  assert.equal(r.priceBands.find((b) => b.key === "10to20m")?.count, 1);
  assert.equal(r.priceBands.find((b) => b.key === "50to100m")?.count, 1);
});

test("ranking is deterministic: value, then more lines, then name, then key - whatever the input order", () => {
  const rows: CompositionLine[] = [
    line({ price: 100, productId: "k2", productCode: "B", productName: "B" }),
    line({ price: 100, productId: "k1", productCode: "A", productName: "A" }),
    line({ price: 50, productId: "k3", productCode: "C", productName: "C" }),
    line({ price: 50, productId: "k3", productCode: "C", productName: "C" }),
    line({ price: 100, productId: "k4", productCode: "D", productName: "D" }),
  ];
  const expected = ["k3", "k1", "k2", "k4"]; // k3: 100 over 2 lines wins the tie on count; then A, B, D
  assert.deepEqual(buildComposition(rows).topProducts.rows.map((p) => p.productId), expected);
  assert.deepEqual(buildComposition([...rows].reverse()).topProducts.rows.map((p) => p.productId), expected);
});

test("only the top N products are listed; 'Khác' carries the rest so the chart still adds up to the total", () => {
  const lines = Array.from({ length: 15 }, (_, i) => line({ price: (i + 1) * 1_000_000, productId: `p${i}`, productCode: `P${i}` }));
  const r = buildComposition(lines);
  assert.equal(r.topProducts.rows.length, TOP_PRODUCTS_LIMIT);
  assert.equal(r.topProducts.others.productCount, 5);
  assert.equal(r.topProducts.others.count, 5);
  assert.equal(r.topProducts.distinctProducts, 15);
  assert.equal(sum(r.topProducts.rows) + r.topProducts.others.value, r.total);
  assert.ok(r.topProducts.rows[0].value >= r.topProducts.rows[TOP_PRODUCTS_LIMIT - 1].value);
  assert.equal(buildComposition(lines, 0).topProducts.rows.length, 0);
  assert.equal(buildComposition(lines, 0).topProducts.others.value, r.total);
});

test("shares are value / total, and zero (never NaN) when the total is zero", () => {
  const r = buildComposition([line({ price: 30 }), line({ price: 70, productId: "q", productCode: "Q", category: "Nhẫn" })]);
  assert.equal(r.categories.find((c) => c.label === "Nhẫn")?.share, 0.7);
  const z = buildComposition([line({ price: 0 })]);
  assert.equal(z.total, 0);
  assert.ok(z.categories.every((c) => c.share === 0));
  assert.ok(z.priceBands.every((b) => b.share === 0));
});

test("an empty input yields a stable, all-zero structure", () => {
  const r = buildComposition([]);
  assert.equal(r.total, 0);
  assert.equal(r.count, 0);
  assert.deepEqual(r.topProducts.rows, []);
  assert.deepEqual(r.categories, []);
  assert.equal(r.priceBands.length, 6);
  assert.ok(r.priceBands.every((b) => b.value === 0 && b.count === 0));
});

test("the three groupings always reconcile to the one total (and nothing carries cost or profit)", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const cats = ["Vòng", "Nhẫn", "Chuỗi", null, "Phí vận chuyển"];
  const lines: CompositionLine[] = Array.from({ length: 200 }, (_, i) => {
    const found = rnd() > 0.05;
    const n = Math.floor(rnd() * 60);
    return line({
      price: rnd() > 0.04 ? Math.floor(rnd() * 300_000_000) : null,
      productId: `p${n}`,
      productCode: `SP${n}`,
      category: cats[i % cats.length],
      productFound: found,
    });
  });
  const r = buildComposition(lines);
  const expected = lines.reduce((s, l) => s + lineValue(l.price), 0);
  assert.equal(r.total, expected);
  assert.equal(sum(r.topProducts.rows) + r.topProducts.others.value, expected);
  assert.equal(sum(r.categories), expected);
  assert.equal(sum(r.priceBands), expected);
  assert.equal(r.count, 200);
  assert.equal(r.priceBands.reduce((s, b) => s + b.count, 0), 200);
  assert.doesNotMatch(JSON.stringify(r), /cost|profit|margin/i);
});
