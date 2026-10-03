import { makeFakeReportingClient, FakeData, FakeOrderItem, SEPTEMBER_SCENARIO } from "@/lib/monthlySoldProducts/fakeReportingClient.testutil";
import { applyWindow, FakeStats, WindowState } from "@/lib/reports/postgrestFake.testutil";

// Test-only. Extends the shared reporting fake (fakeReportingClient.testutil.ts,
// left untouched so every existing test keeps reading exactly what it did)
// with what the Phase 1 Overview/drill-down reads additionally need:
//  - customer_purchases with the richer embed (id, order number, product,
//    customer code) used by fetchPurchaseRows;
//  - order_items looked up by product_id (the order currently holding a product);
//  - the products table as inventory (status / sale_price / category / ...),
//    with .order() and .range() so paging past the 1000-row cap is exercised.
// `orders`, `payments` and `staff` fall through to the shared fake.

export interface FakeInventoryProduct {
  id: string;
  product_code: string;
  product_name: string;
  category: string | null;
  status: string;
  sale_price: number | null;
  batch_id: string | null;
  salesperson: string | null;
}

export interface OverviewFakeData extends FakeData {
  products: FakeInventoryProduct[];
}

interface Filters {
  in: Record<string, unknown[]>;
  eq: Record<string, unknown>;
  isNull: string[];
  gte: Record<string, string>;
  lt: Record<string, string>;
}

export const callLog: { table: string; select: string }[] = [];

export function makeOverviewFakeClient(data: OverviewFakeData, stats?: FakeStats) {
  const base = makeFakeReportingClient(data, stats) as { from: (t: string) => unknown };

  return {
    from(table: string) {
      if (table !== "customer_purchases" && table !== "order_items" && table !== "products") {
        return base.from(table);
      }

      const f: Filters = { in: {}, eq: {}, isNull: [], gte: {}, lt: {} };
      const w: WindowState = {};
      let selected = "";
      const inRange = (value: string | undefined, col: string) =>
        (f.gte[col] === undefined || (value ?? "") >= f.gte[col]) && (f.lt[col] === undefined || (value ?? "") < f.lt[col]);

      const resolve = (): unknown[] => {
        if (table === "customer_purchases") {
          callLog.push({ table, select: selected });
          return data.purchases
            .filter(
              (p) =>
                (f.isNull.includes("order_item_id") ? p.order_item_id === null : true) &&
                // Phase 1.2: honor .in("order_item_id", chunk) like the server (snapshot lookups are chunked)
                (!f.in.order_item_id || (p.order_item_id !== null && f.in.order_item_id.includes(p.order_item_id))) &&
                inRange(p.sale_date, "sale_date")
            )
            .map((p) => {
              const oi = p.order_item_id ? data.orderItems.find((i) => i.id === p.order_item_id) : undefined;
              const ord = oi ? data.orders.find((o) => o.id === oi.order_id) : undefined;
              return {
                id: p.id,
                customer_id: p.customer_id,
                product_id: p.product_id,
                sale_price: p.sale_price,
                sale_date: p.sale_date,
                source: null,
                salesperson: p.salesperson,
                order_item_id: p.order_item_id,
                order_items: oi
                  ? {
                      id: oi.id,
                      order_id: oi.order_id,
                      orders: ord
                        ? { order_number: ord.order_number, order_status: ord.order_status, payment_status: ord.payment_status }
                        : null,
                    }
                  : null,
                customer: { full_name: p.customer.full_name, customer_code: p.customer.customer_code },
                product: p.product ? { product_code: p.product.product_code, product_name: p.product.product_name } : null,
              };
            });
        }

        if (table === "order_items") {
          if (f.in.product_id) {
            return data.orderItems
              .filter((i: FakeOrderItem) => i.product_id && f.in.product_id.includes(i.product_id))
              .map((i) => {
                const o = data.orders.find((x) => x.id === i.order_id);
                return {
                  product_id: i.product_id,
                  order: o
                    ? {
                        id: o.id,
                        order_number: o.order_number,
                        order_date: o.order_date,
                        order_status: o.order_status,
                        payment_status: o.payment_status,
                        total_amount: o.total_amount,
                        customer: o.customer,
                      }
                    : null,
                };
              });
          }
          return data.orderItems.filter((i) => !f.in.order_id || f.in.order_id.includes(i.order_id));
        }

        // products
        callLog.push({ table, select: selected });
        if (!selected.includes("status")) {
          // Cost lookup used by getPurchaseReportData ("id, cost_price").
          const known = new Map<string, number | null>();
          for (const p of data.purchases) if (p.product_id) known.set(p.product_id, p.product?.cost_price ?? null);
          return [...known].filter(([id]) => !f.in.id || f.in.id.includes(id)).map(([id, cost_price]) => ({ id, cost_price }));
        }
        return data.products.filter(
          (p) =>
            (!f.in.status || f.in.status.includes(p.status)) &&
            (f.eq.category === undefined || p.category === f.eq.category) &&
            (f.eq.salesperson === undefined || p.salesperson === f.eq.salesperson) &&
            (f.eq.batch_id === undefined || p.batch_id === f.eq.batch_id)
        );
      };

      const builder: Record<string, unknown> = {
        select: (cols?: string, opts?: { count?: string }) => {
          selected = cols ?? "";
          if (opts?.count === "exact") w.countExact = true;
          return builder;
        },
        in: (col: string, vals: unknown[]) => ((f.in[col] = vals), builder),
        eq: (col: string, val: unknown) => ((f.eq[col] = val), builder),
        is: (col: string) => (f.isNull.push(col), builder),
        gte: (col: string, val: string) => ((f.gte[col] = val), builder),
        lt: (col: string, val: string) => ((f.lt[col] = val), builder),
        order: (col: string, opts?: { ascending?: boolean }) => ((w.order = { col, ascending: opts?.ascending ?? true }), builder),
        range: (from: number, to: number) => ((w.range = [from, to]), builder),
        then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => {
          const { data: rows, count } = applyWindow(resolve(), w, stats, table);
          return Promise.resolve({ data: rows, error: null, count }).then(ok, fail);
        },
      };
      return builder;
    },
  };
}

// ---------------------------------------------------------------------------
// September scenario + inventory (extends SEPTEMBER_SCENARIO from the shared
// fake: O1..O8 / L1 exactly as there). Product ids follow `item()`'s rule in
// that file: I4 -> p5 (O4, Reserved + a real payment), I5 -> p6 (O5, Reserved
// unpaid), I6 -> p7 (O6, Draft).
//
//   p5  Reserved  300   held by O4  -> Held AND Sold (LOCKED overlap)
//   p6  Reserved   40   held by O5  -> Held, NOT Sold (Reserved, no payment)
//   p7  Reserved   20   held by O6  -> Held, NOT Sold (Draft)
//   p11 Reserved  null  no open order -> Held, unlinked + missing price
//   pA1 Available 100 / pA2 Available 50 (Vòng tay) / pA3 Available 25 (Nhẫn)
//   pS  Sold, pP Paused, pR Archived     -> in neither metric
//   O9  Completed, August (out of range) also references p6 - history must
//       never override the live hold by O5.
// ---------------------------------------------------------------------------

const ph = (id: string, status: string, price: number | null, category: string | null = "Vòng tay"): FakeInventoryProduct => ({
  id,
  product_code: `CODE-${id}`,
  product_name: `Tên ${id}`,
  category,
  status,
  sale_price: price,
  batch_id: null,
  salesperson: "Nhân viên A",
});

export function makeOverviewScenario(): OverviewFakeData {
  const base: FakeData = JSON.parse(JSON.stringify(SEPTEMBER_SCENARIO));
  base.orders.push({
    id: "O9",
    order_number: "ORD-O9",
    order_status: "Completed",
    payment_status: "Paid",
    order_date: "2026-08-15",
    total_amount: 70,
    customer_id: "c1",
    sales_owner: "Nhân viên A",
    customer: { full_name: "Khách 1", customer_code: "KH01" },
  });
  base.orderItems.push({
    id: "I9",
    order_id: "O9",
    product_id: "p6",
    snapshot_sale_price: 70,
    discount: 0,
    quantity: 1,
    product: { product_code: "SP06", product_name: "Sản phẩm 6", category: "Vòng tay", jade_type: "Jadeite", cost_price: 10 },
  });
  return {
    ...base,
    products: [
      ph("p5", "Reserved", 300),
      ph("p6", "Reserved", 40),
      ph("p7", "Reserved", 20),
      ph("p11", "Reserved", null),
      ph("pA1", "Available", 100),
      ph("pA2", "Available", 50),
      ph("pA3", "Available", 25, "Nhẫn"),
      ph("pS", "Sold", 999),
      ph("pP", "Paused", 999),
      ph("pR", "Archived", 999),
    ],
  };
}
