import test from "node:test";
import assert from "node:assert/strict";
import { fullPageHref, parseDetailParam, withDetailParam } from "./entityDetailParam";

const ID = "3f2c1a40-8b1e-4c7a-9d55-0a1b2c3d4e5f";

test("parseDetailParam accepts the four approved types and rejects everything else", () => {
  for (const t of ["order", "product", "customer", "inventory"]) {
    assert.deepEqual(parseDetailParam(`${t}:${ID}`), { type: t, id: ID });
  }
  assert.equal(parseDetailParam(null), null);
  assert.equal(parseDetailParam(""), null);
  assert.equal(parseDetailParam(`batch:${ID}`), null);
  assert.equal(parseDetailParam("order:not-a-uuid"), null);
  assert.equal(parseDetailParam(`order${ID}`), null);
});

test("withDetailParam preserves every other param (dateFrom/dateTo/metric/view/filters)", () => {
  const out = withDetailParam("metric=sold&view=products&dateFrom=2026-10-01&customer=A+B", { type: "order", id: ID });
  const p = new URLSearchParams(out);
  assert.equal(p.get("detail"), `order:${ID}`);
  assert.equal(p.get("metric"), "sold");
  assert.equal(p.get("view"), "products");
  assert.equal(p.get("dateFrom"), "2026-10-01");
  assert.equal(p.get("customer"), "A B");

  const cleared = new URLSearchParams(withDetailParam(out, null));
  assert.equal(cleared.has("detail"), false);
  assert.equal(cleared.get("metric"), "sold");
});

test("fullPageHref points at the official management pages", () => {
  assert.equal(fullPageHref({ type: "order", id: ID }), `/orders/${ID}`);
  assert.equal(fullPageHref({ type: "product", id: ID }), `/products/${ID}`);
  assert.equal(fullPageHref({ type: "customer", id: ID }), `/customers/${ID}`);
  assert.equal(fullPageHref({ type: "inventory", id: ID }), "/inventory");
});
