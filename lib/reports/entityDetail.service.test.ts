import test, { before, mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Phase 1.6 - Reporting drawer detail reads. Real service code; only the
 * Supabase client, the Orders data-scope helper and getOrderDetail are faked.
 *
 * Locked here:
 *  - data scope (PO decision 2): an order outside the caller's Orders scope is
 *    never returned - not as the drawer subject, not in a product's / customer's
 *    related-order list, not as an inventory holding order, and never counted
 *    in the customer total;
 *  - order level vs product level money is kept apart (paid / remaining only
 *    under `totals`; per-item rows carry price / quantity / line total);
 *  - no sensitive fields leak (address, bank account, cost).
 */

type Row = Record<string, unknown>;
interface Tables {
  [table: string]: Row[];
}

let tables: Tables = {};

class Builder {
  private filters: ((r: Row) => boolean)[] = [];
  private limitN: number | null = null;
  private rangeArg: [number, number] | null = null;
  constructor(private table: string) {}
  select() {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  order() {
    return this;
  }
  range(from: number, to: number) {
    this.rangeArg = [from, to];
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  scope(fn: (r: Row) => boolean) {
    this.filters.push(fn);
    return this;
  }
  private rows(): Row[] {
    let out = (tables[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
    if (this.rangeArg) out = out.slice(this.rangeArg[0], this.rangeArg[1] + 1);
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    return out;
  }
  async maybeSingle() {
    return { data: this.rows()[0] ?? null, error: null };
  }
  then(resolve: (v: { data: Row[]; error: null; count: number }) => unknown) {
    const data = this.rows();
    return Promise.resolve({ data, error: null, count: data.length }).then(resolve);
  }
}
const client = { from: (t: string) => new Builder(t) } as never;

const OWNER = { id: "s1", full_name: "Nhân viên A" };
const ids = {
  oIn: "00000000-0000-4000-8000-000000000001",
  oOut: "00000000-0000-4000-8000-000000000002",
  c1: "00000000-0000-4000-8000-0000000000c1",
  p1: "00000000-0000-4000-8000-0000000000a1",
};

before(() => {
  // Orders scope == "sales_owner matches the staff member's full name".
  mock.module("@/lib/permission/dataScope", {
    namedExports: {
      applyDataScopeByName: async (q: Builder, staff: { full_name: string }) => ({
        query: q.scope((r) => r.sales_owner === staff.full_name),
      }),
    },
  });
  mock.module("@/lib/orders/order.service", {
    namedExports: {
      getOrderDetail: async (id: string, staff: { full_name: string }) => {
        const o = (tables.orders ?? []).find((r) => r.id === id && r.sales_owner === staff.full_name);
        if (!o) return null;
        return {
          order: { ...o, customer: { id: ids.c1, full_name: "Khách 1", customer_code: "KH01", phone: "0900", address: "SECRET" } },
          items: (tables.order_items ?? [])
            .filter((i) => i.order_id === id)
            .map((i) => ({ ...i, product: { product_code: "SP1", product_name: "Vòng lam", cost_price: 1 } })),
          payments: (tables.payments ?? [])
            .filter((p) => p.order_id === id)
            .map((p) => ({ ...p, receiving_account: { account_number: "SECRET-ACCT" } })),
          events: [],
        };
      },
    },
  });
});

function seed() {
  const base = { order_date: "2026-10-03", order_status: "Reserved", payment_status: "Partially Paid", customer_id: ids.c1 };
  const cust = { id: ids.c1, full_name: "Khách 1", customer_code: "KH01" };
  tables = {
    orders: [
      { id: ids.oIn, order_number: "OD-1", total_amount: 100, sales_owner: OWNER.full_name, ...base, customer: cust },
      { id: ids.oOut, order_number: "OD-2", total_amount: 900, sales_owner: "Người khác", ...base, customer: cust },
    ],
    order_items: [
      { id: "i1", order_id: ids.oIn, product_id: ids.p1, snapshot_sale_price: 58, discount: 0, quantity: 1, line_total: 58, is_gift: false },
      { id: "i2", order_id: ids.oIn, product_id: "p2", snapshot_sale_price: 42, discount: 0, quantity: 1, line_total: 42, is_gift: false },
      { id: "i3", order_id: ids.oOut, product_id: ids.p1, snapshot_sale_price: 900, discount: 0, quantity: 1, line_total: 900, is_gift: false },
    ],
    payments: [
      { id: "pay1", order_id: ids.oIn, amount: 30, payment_method: "Cash", payment_date: "2026-10-03" },
      { id: "pay2", order_id: ids.oOut, amount: 5, payment_method: "Cash", payment_date: "2026-10-03" },
    ],
    products: [{ id: ids.p1, product_code: "SP1", product_name: "Vòng lam", category: "Vòng", status: "Reserved", sale_price: 58, batch_id: null, cost_price: 1 }],
    customers: [{ id: ids.c1, customer_code: "KH01", full_name: "Khách 1", phone: "0900", address: "SECRET" }],
  };
}

test("order drawer: order-level totals are separate from line-level money, out-of-scope is null, no sensitive fields", async () => {
  seed();
  const { getOrderDrawerData } = await import("./entityDetail.service");

  const data = await getOrderDrawerData(ids.oIn, OWNER as never, client);
  assert.ok(data);
  assert.deepEqual(data.totals, { total_amount: 100, amount_paid: 30, remaining_balance: 70 });
  assert.equal(data.items.length, 2);
  assert.deepEqual(Object.keys(data.items[0]).sort(), [
    "discount",
    "is_gift",
    "item_id",
    "line_total",
    "product_code",
    "product_id",
    "product_name",
    "quantity",
    "unit_price",
  ]);
  assert.deepEqual(Object.keys(data.payments[0]).sort(), ["amount", "payment_date", "payment_method"]);
  assert.ok(!JSON.stringify(data).includes("SECRET"));

  assert.equal(await getOrderDrawerData(ids.oOut, OWNER as never, client), null);
});

test("product drawer lists only in-scope orders", async () => {
  seed();
  const { getProductDrawerData } = await import("./entityDetail.service");
  const data = await getProductDrawerData(ids.p1, OWNER as never, client);
  assert.ok(data);
  assert.deepEqual(
    data.orders.map((o) => o.order_id),
    [ids.oIn]
  );
  assert.equal(data.orders[0].line_total, 58);
  assert.equal(data.orders[0].total_amount, 100);
  assert.ok(!("cost_price" in data.product));
});

test("customer drawer: scoped orders and total, only approved fields", async () => {
  seed();
  const { getCustomerDrawerData } = await import("./entityDetail.service");
  const data = await getCustomerDrawerData(ids.c1, OWNER as never, client);
  assert.ok(data);
  assert.deepEqual(
    data.orders.map((o) => o.order_id),
    [ids.oIn]
  );
  assert.equal(data.summary.total_order_value, 100); // the 900 out-of-scope order is NOT counted
  assert.deepEqual(Object.keys(data.customer).sort(), ["customer_code", "full_name", "id", "phone"]);
  assert.ok(!JSON.stringify(data).includes("SECRET"));
});

test("inventory drawer: held product shows the in-scope holding order with order-level paid / remaining", async () => {
  seed();
  const { getInventoryDrawerData } = await import("./entityDetail.service");
  const data = await getInventoryDrawerData(ids.p1, OWNER as never, client);
  assert.ok(data);
  assert.equal(data.bucket, "held");
  assert.equal(data.holding_order?.order_id, ids.oIn);
  assert.equal(data.holding_order?.amount_paid, 30);
  assert.equal(data.holding_order?.remaining_balance, 70);

  // A caller who can see neither order gets no holding order (and no leak of the other owner's).
  const stranger = await getInventoryDrawerData(ids.p1, { id: "s9", full_name: "Không ai" } as never, client);
  assert.equal(stranger?.holding_order, null);
});

test("unknown product / customer -> null", async () => {
  seed();
  const s = await import("./entityDetail.service");
  assert.equal(await s.getProductDrawerData("nope", OWNER as never, client), null);
  assert.equal(await s.getCustomerDrawerData("nope", OWNER as never, client), null);
  assert.equal(await s.getInventoryDrawerData("nope", OWNER as never, client), null);
});
