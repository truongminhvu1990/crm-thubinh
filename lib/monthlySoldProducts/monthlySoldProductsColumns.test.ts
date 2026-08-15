import test from "node:test";
import assert from "node:assert/strict";
import {
  MONTHLY_SOLD_PRODUCTS_COLUMNS,
  DEFAULT_VISIBLE_MONTHLY_SOLD_PRODUCTS_COLUMNS,
  getAvailableMonthlySoldProductsColumns,
} from "./monthlySoldProductsColumns";
import { MonthlySoldProductRow } from "@/types/monthlySoldProducts";

function baseRow(overrides: Partial<MonthlySoldProductRow> = {}): MonthlySoldProductRow {
  return {
    purchase_id: "p1",
    sale_date: "2026-08-01",
    order_number: "000123",
    product_id: "prod1",
    product_code: "SP001",
    product_name: "Vòng cẩm thạch",
    product_category: "Vòng tay",
    jade_type: "Jadeite",
    customer_id: "cust1",
    customer_name: "Nguyễn Văn A",
    customer_code: "KH001",
    salesperson: "Trần Thị B",
    original_price: 10_000_000,
    discount: 500_000,
    final_sale_price: 9_500_000,
    gross_profit: 2_000_000,
    amount_paid: 6_000_000,
    remaining_balance: 3_500_000,
    payment_methods: "Tiền mặt",
    ...overrides,
  };
}

test("Payment Details columns (amount_paid/remaining_balance/payment_methods) exist and are independently hideable, like every other column", () => {
  const keys = MONTHLY_SOLD_PRODUCTS_COLUMNS.map((c) => c.key);
  assert.ok(keys.includes("amount_paid"));
  assert.ok(keys.includes("remaining_balance"));
  assert.ok(keys.includes("payment_methods"));

  // No availableWhen gate on any of the three — unlike gross_profit, they're
  // not cost/margin figures, so they must be offered to every viewer who can
  // see the report at all (no canViewGrossProfit-style restriction).
  for (const key of ["amount_paid", "remaining_balance", "payment_methods"] as const) {
    const col = MONTHLY_SOLD_PRODUCTS_COLUMNS.find((c) => c.key === key)!;
    assert.equal(col.availableWhen, undefined);
  }
});

test("Payment Details columns default to visible, matching every other column's default", () => {
  assert.ok(DEFAULT_VISIBLE_MONTHLY_SOLD_PRODUCTS_COLUMNS.has("amount_paid"));
  assert.ok(DEFAULT_VISIBLE_MONTHLY_SOLD_PRODUCTS_COLUMNS.has("remaining_balance"));
  assert.ok(DEFAULT_VISIBLE_MONTHLY_SOLD_PRODUCTS_COLUMNS.has("payment_methods"));
});

test("Payment Details columns are available to every viewer, gross_profit is not (canViewGrossProfit: false)", () => {
  const available = getAvailableMonthlySoldProductsColumns({ canViewGrossProfit: false }).map((c) => c.key);
  assert.ok(available.includes("amount_paid"));
  assert.ok(available.includes("remaining_balance"));
  assert.ok(available.includes("payment_methods"));
  assert.ok(!available.includes("gross_profit"));
});

test("export: amount_paid/remaining_balance export their numeric values", () => {
  const row = baseRow();
  const amountPaidCol = MONTHLY_SOLD_PRODUCTS_COLUMNS.find((c) => c.key === "amount_paid")!;
  const remainingCol = MONTHLY_SOLD_PRODUCTS_COLUMNS.find((c) => c.key === "remaining_balance")!;
  assert.equal(amountPaidCol.exportValue(row), 6_000_000);
  assert.equal(remainingCol.exportValue(row), 3_500_000);
});

test("export: payment_methods exports the comma-joined string as-is", () => {
  const row = baseRow({ payment_methods: "Chuyển khoản, Tiền mặt" });
  const col = MONTHLY_SOLD_PRODUCTS_COLUMNS.find((c) => c.key === "payment_methods")!;
  assert.equal(col.exportValue(row), "Chuyển khoản, Tiền mặt");
});

test("export: null Payment Details (no linked Order) export as empty string, not 'null'", () => {
  const row = baseRow({ amount_paid: null, remaining_balance: null, payment_methods: null });
  for (const key of ["amount_paid", "remaining_balance", "payment_methods"] as const) {
    const col = MONTHLY_SOLD_PRODUCTS_COLUMNS.find((c) => c.key === key)!;
    assert.equal(col.exportValue(row), "");
  }
});
