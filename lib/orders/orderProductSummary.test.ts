import test from "node:test";
import assert from "node:assert/strict";
import { formatOrderProducts } from "./orderProductSummary";

test("one product -> its name", () => assert.equal(formatOrderProducts(["Vòng lam tím hoa bay"], 1), "Vòng lam tím hoa bay"));
test("many -> first name + (N-1) sản phẩm", () =>
  assert.equal(formatOrderProducts(["Vòng lam tím hoa bay", "B", "C"], 3), "Vòng lam tím hoa bay + 2 sản phẩm"));
test("N comes from the item count, not from how many names loaded", () => assert.equal(formatOrderProducts(["A"], 3), "A + 2 sản phẩm"));
test("names unavailable -> falls back to the count", () => {
  assert.equal(formatOrderProducts([], 2), "2 sản phẩm");
  assert.equal(formatOrderProducts(undefined, 1), "1 sản phẩm");
});
test("no items -> dash", () => assert.equal(formatOrderProducts([], 0), "—"));
