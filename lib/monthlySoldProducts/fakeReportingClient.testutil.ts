// Test-only in-memory stand-in for the Supabase query builder, covering
// exactly the chains the revenue/sold-products reads use (orders, order_items,
// customer_purchases, payments, staff). Shared by the Monthly Sold Products
// repository test and the Dashboard-vs-Sold Products reconciliation test so
// both read the SAME fixture through the SAME fake.

export interface FakeOrder {
  id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  order_date: string;
  total_amount: number;
  customer_id: string;
  sales_owner: string | null;
  customer: { full_name: string; customer_code: string };
}

export interface FakeOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  snapshot_sale_price: number;
  discount: number;
  quantity: number;
  product: { product_code: string; product_name: string; category: string; jade_type: string | null; cost_price: number | null } | null;
}

export interface FakePurchase {
  id: string;
  order_item_id: string | null;
  customer_id: string;
  product_id: string | null;
  sale_price: number;
  sale_date: string;
  salesperson: string | null;
  salesperson_id: string | null;
  customer: { full_name: string; customer_code: string };
  product: { product_code: string; product_name: string; category: string; jade_type: string | null; cost_price: number | null } | null;
}

export interface FakeData {
  orders: FakeOrder[];
  orderItems: FakeOrderItem[];
  purchases: FakePurchase[];
  payments: { order_id: string; amount: number; payment_method: string }[];
  staff?: { id: string; full_name: string }[];
}

interface Filters {
  in: Record<string, unknown[]>;
  neq: Record<string, unknown>;
  eq: Record<string, unknown>;
  isNull: string[];
  gte: Record<string, string>;
  lt: Record<string, string>;
}

export function makeFakeReportingClient(data: FakeData) {
  return {
    from(table: string) {
      const f: Filters = { in: {}, neq: {}, eq: {}, isNull: [], gte: {}, lt: {} };
      let selected = "";

      const inRange = (value: string | undefined, col: string) =>
        (f.gte[col] === undefined || (value ?? "") >= f.gte[col]) && (f.lt[col] === undefined || (value ?? "") < f.lt[col]);

      const resolve = (): unknown[] => {
        switch (table) {
          case "orders":
            return data.orders.filter(
              (o) =>
                (!f.in.order_status || f.in.order_status.includes(o.order_status)) &&
                (f.neq.order_status === undefined || o.order_status !== f.neq.order_status) &&
                inRange(o.order_date, "order_date")
            );
          case "order_items":
            return data.orderItems.filter((i) => !f.in.order_id || f.in.order_id.includes(i.order_id));
          case "customer_purchases":
            // Dashboard's getPurchaseReportData shape: every purchase in the
            // sale_date range (linked AND legacy) with its order status embedded.
            if (selected.includes("order_items(")) {
              return data.purchases
                .filter((p) => inRange(p.sale_date, "sale_date"))
                .map((p) => {
                  const oi = p.order_item_id ? data.orderItems.find((i) => i.id === p.order_item_id) : undefined;
                  const ord = oi ? data.orders.find((o) => o.id === oi.order_id) : undefined;
                  return {
                    customer_id: p.customer_id,
                    product_id: p.product_id,
                    sale_price: p.sale_price,
                    sale_date: p.sale_date,
                    source: null,
                    salesperson: p.salesperson,
                    order_item_id: p.order_item_id,
                    order_items: ord ? { orders: { order_status: ord.order_status, payment_status: ord.payment_status } } : null,
                    customer: { full_name: p.customer.full_name },
                  };
                });
            }
            if (f.isNull.includes("order_item_id")) {
              return data.purchases.filter((p) => p.order_item_id === null && inRange(p.sale_date, "sale_date"));
            }
            return data.purchases.filter((p) => p.order_item_id !== null && (!f.in.order_item_id || f.in.order_item_id.includes(p.order_item_id)));
          case "payments":
            return data.payments.filter((p) => !f.in.order_id || f.in.order_id.includes(p.order_id));
          case "products": {
            const known = new Map<string, number | null>();
            for (const p of data.purchases) if (p.product_id) known.set(p.product_id, p.product?.cost_price ?? null);
            return [...known].filter(([id]) => !f.in.id || f.in.id.includes(id)).map(([id, cost_price]) => ({ id, cost_price }));
          }
          case "staff":
            return (data.staff ?? []).filter((s) => f.eq.id === undefined || s.id === f.eq.id);
          default:
            throw new Error(`Unexpected table in fake client: ${table}`);
        }
      };

      const builder: Record<string, unknown> = {
        select: (cols?: string) => ((selected = cols ?? ""), builder),
        in: (col: string, vals: unknown[]) => ((f.in[col] = vals), builder),
        neq: (col: string, val: unknown) => ((f.neq[col] = val), builder),
        eq: (col: string, val: unknown) => ((f.eq[col] = val), builder),
        is: (col: string) => (f.isNull.push(col), builder),
        gte: (col: string, val: string) => ((f.gte[col] = val), builder),
        lt: (col: string, val: string) => ((f.lt[col] = val), builder),
        maybeSingle: () => Promise.resolve({ data: resolve()[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
          Promise.resolve({ data: resolve(), error: null }).then(ok, fail),
      };
      return builder;
    },
  };
}

// ---------------------------------------------------------------------------
// Shared September-style scenario (values in VND thousands, purely
// illustrative - the tests assert relationships, never these literals as
// business figures):
//   O1 Completed/Paid            100  1 line  -> recognized
//   O2 Completed/Paid             60  2 lines -> recognized (one order, two lines)
//   O3 Completed/PartiallyPaid    50  1 line  -> sold, unrecognized
//   O4 Reserved/PartiallyPaid    200  1 line  -> sold (deposit), unrecognized, NO purchase snapshot
//   O5 Reserved/Unpaid            30           -> in Total, NOT sold
//   O6 Draft/Unpaid               10           -> in Total, NOT sold
//   O7 Lost                      500           -> excluded everywhere
//   O8 Completed/Paid (October)  999           -> out of range
//   L1 legacy purchase (no order)  25          -> recognized by BR-002
// ---------------------------------------------------------------------------

const cust = (n: number) => ({ full_name: `Khách ${n}`, customer_code: `KH0${n}` });
const prod = (n: number, cost: number | null = null) => ({
  product_code: `SP0${n}`,
  product_name: `Sản phẩm ${n}`,
  category: "Vòng tay",
  jade_type: "Jadeite",
  cost_price: cost,
});

function order(id: string, status: string, pay: string, date: string, total: number, customerN: number): FakeOrder {
  return {
    id,
    order_number: `ORD-${id}`,
    order_status: status,
    payment_status: pay,
    order_date: date,
    total_amount: total,
    customer_id: `c${customerN}`,
    sales_owner: "Nhân viên A",
    customer: cust(customerN),
  };
}

function item(id: string, orderId: string, price: number, n: number, discount = 0): FakeOrderItem {
  return { id, order_id: orderId, product_id: `p${n}`, snapshot_sale_price: price, discount, quantity: 1, product: prod(n, 10) };
}

function snapshot(id: string, itemId: string, amount: number, date: string, customerN: number, n: number): FakePurchase {
  return {
    id,
    order_item_id: itemId,
    customer_id: `c${customerN}`,
    product_id: `p${n}`,
    sale_price: amount,
    sale_date: date,
    salesperson: "Nhân viên A",
    salesperson_id: "staff-a",
    customer: cust(customerN),
    product: prod(n, 10),
  };
}

export const SEPTEMBER_SCENARIO: FakeData = {
  orders: [
    order("O1", "Completed", "Paid", "2026-09-05", 100, 1),
    order("O2", "Completed", "Paid", "2026-09-06", 60, 2),
    order("O3", "Completed", "PartiallyPaid", "2026-09-07", 50, 3),
    order("O4", "Reserved", "PartiallyPaid", "2026-09-08", 200, 4),
    order("O5", "Reserved", "Unpaid", "2026-09-09", 30, 5),
    order("O6", "Draft", "Unpaid", "2026-09-10", 10, 6),
    order("O7", "Lost", "Unpaid", "2026-09-11", 500, 7),
    order("O8", "Completed", "Paid", "2026-10-02", 999, 8),
  ],
  orderItems: [
    item("I1", "O1", 100, 1),
    item("I2a", "O2", 40, 2),
    item("I2b", "O2", 20, 3),
    item("I3", "O3", 50, 4),
    item("I4", "O4", 200, 5),
    item("I5", "O5", 30, 6),
    item("I6", "O6", 10, 7),
    item("I7", "O7", 500, 8),
    item("I8", "O8", 999, 9),
  ],
  purchases: [
    snapshot("P1", "I1", 100, "2026-09-05", 1, 1),
    snapshot("P2a", "I2a", 40, "2026-09-06", 2, 2),
    snapshot("P2b", "I2b", 20, "2026-09-06", 2, 3),
    snapshot("P3", "I3", 50, "2026-09-07", 3, 4),
    snapshot("P8", "I8", 999, "2026-10-02", 8, 9),
    {
      id: "L1",
      order_item_id: null,
      customer_id: "c9",
      product_id: "p10",
      sale_price: 25,
      sale_date: "2026-09-25",
      salesperson: "Nhân viên A",
      salesperson_id: "staff-a",
      customer: cust(9),
      product: prod(10, 5),
    },
  ],
  payments: [
    { order_id: "O1", amount: 100, payment_method: "Tiền mặt" },
    { order_id: "O2", amount: 60, payment_method: "Chuyển khoản" },
    { order_id: "O3", amount: 20, payment_method: "Tiền mặt" },
    { order_id: "O4", amount: 50, payment_method: "Chuyển khoản" },
  ],
  staff: [{ id: "staff-a", full_name: "Nhân viên A" }],
};

export const SEPTEMBER_RANGE = { start: "2026-09-01", end: "2026-10-01" };
