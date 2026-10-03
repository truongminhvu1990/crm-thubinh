import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_SALES_DATA_MESSAGE } from "./format";
import {
  EMPTY_VALUE,
  NO_ITEMS_ROW_LABEL,
  NO_SALES_DATA_TEXT,
  TERMS,
  UNRECOGNIZED_REASON_LABELS,
  orderStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  recognitionLabel,
  unrecognizedReasonText,
} from "./labels.vi";
import { getUnrecognizedReason, type UnrecognizedReasonCode } from "./revenueDefinition";

test("order statuses reuse the Orders module labels, and Lost / Cancelled stay DIFFERENT", () => {
  assert.equal(orderStatusLabel("Completed"), "Hoàn thành");
  assert.equal(orderStatusLabel("Reserved"), "Đã giữ hàng");
  assert.equal(orderStatusLabel("Draft"), "Nháp");
  assert.equal(orderStatusLabel("Lost"), "Đã mất");
  assert.equal(orderStatusLabel("Cancelled"), "Đã hủy");
  assert.notEqual(orderStatusLabel("Lost"), orderStatusLabel("Cancelled"));
});

test("payment statuses", () => {
  assert.equal(paymentStatusLabel("Paid"), "Đã thanh toán");
  assert.equal(paymentStatusLabel("Partially Paid"), "Thanh toán một phần");
  assert.equal(paymentStatusLabel("Unpaid"), "Chưa thanh toán");
});

test("missing and unknown status values are handled gracefully, in Vietnamese", () => {
  for (const v of [null, undefined, "", "   "]) {
    assert.equal(orderStatusLabel(v), EMPTY_VALUE);
    assert.equal(paymentStatusLabel(v), EMPTY_VALUE);
  }
  assert.equal(orderStatusLabel("Shipped"), "Không xác định (Shipped)");
  assert.equal(paymentStatusLabel("Pending"), "Không xác định (Pending)");
});

test("no translated status contains an English status word", () => {
  const all = ["Completed", "Reserved", "Draft", "Lost", "Cancelled"].map(orderStatusLabel).concat(["Paid", "Partially Paid", "Unpaid"].map(paymentStatusLabel));
  for (const t of all) assert.ok(!/\b(Completed|Reserved|Draft|Lost|Cancelled|Paid|Unpaid|Partially)\b/.test(t), t);
});

test("recognition flag", () => {
  assert.equal(recognitionLabel("recognized"), "Đã ghi nhận");
  assert.equal(recognitionLabel("unrecognized"), "Chưa ghi nhận");
  assert.equal(recognitionLabel(undefined), EMPTY_VALUE);
});

test("payment_method: ONLY Bank Transfer and Cash are translated; ck / ckh / tm / TECH_H are kept verbatim", () => {
  assert.equal(paymentMethodLabel("Bank Transfer"), "Chuyển khoản");
  assert.equal(paymentMethodLabel("Cash"), "Tiền mặt");
  for (const raw of ["ck", "ckh", "tm", "TECH_H", "Chuyển khoản", "Tiền mặt"]) assert.equal(paymentMethodLabel(raw), raw);
  assert.equal(paymentMethodLabel("Bank Transfer, Chuyển khoản"), "Chuyển khoản", "translation-created duplicates are collapsed");
  assert.equal(paymentMethodLabel("Bank Transfer, ck"), "Chuyển khoản, ck");
  assert.equal(paymentMethodLabel(null), EMPTY_VALUE);
  assert.equal(paymentMethodLabel(" , "), EMPTY_VALUE);
});

test("unrecognizedReasonText: the canonical { code, label } object renders its LABEL, never [object Object]", () => {
  const reason = { code: "ORDER_NOT_FULLY_PAID", label: "Đã hoàn thành nhưng chưa thanh toán đủ" };
  assert.equal(unrecognizedReasonText(reason), "Đã hoàn thành nhưng chưa thanh toán đủ");
  for (const v of [reason, null, undefined, "", "ORDER_DRAFT", "WHATEVER", { code: "NOPE" }, { label: "" }, {}, 42, [], true]) {
    assert.ok(!unrecognizedReasonText(v).includes("[object Object]"), `value ${JSON.stringify(v)}`);
  }
});

test("unrecognizedReasonText: null / undefined / empty -> dash; bare known code -> Vietnamese; unknown -> generic Vietnamese", () => {
  assert.equal(unrecognizedReasonText(null), EMPTY_VALUE);
  assert.equal(unrecognizedReasonText(undefined), EMPTY_VALUE);
  assert.equal(unrecognizedReasonText(""), EMPTY_VALUE);
  assert.equal(unrecognizedReasonText("ORDER_RESERVED"), "Đã giữ hàng, chưa hoàn thành");
  assert.equal(unrecognizedReasonText("WHATEVER"), "Chưa xác định lý do");
  assert.equal(unrecognizedReasonText({ code: "ORDER_LOST" }), "Đơn đã mất, không tính doanh thu");
  assert.equal(unrecognizedReasonText({ code: "UNKNOWN_CODE" }), "Chưa xác định lý do");
});

test("DRIFT GUARD: the code->label table equals what the canonical getUnrecognizedReason produces (labels live in one rule)", () => {
  const codes = Object.keys(UNRECOGNIZED_REASON_LABELS) as UnrecognizedReasonCode[];
  const samples: Record<UnrecognizedReasonCode, { order: { order_status: string; payment_status: string }; payments: number }> = {
    ORDER_DRAFT: { order: { order_status: "Draft", payment_status: "Unpaid" }, payments: 0 },
    ORDER_RESERVED: { order: { order_status: "Reserved", payment_status: "Unpaid" }, payments: 0 },
    ORDER_NOT_FULLY_PAID: { order: { order_status: "Completed", payment_status: "Unpaid" }, payments: 1 },
    ORDER_LOST: { order: { order_status: "Lost", payment_status: "Unpaid" }, payments: 0 },
  };
  for (const code of codes) {
    const r = getUnrecognizedReason(samples[code].order, samples[code].payments);
    assert.equal(r?.code, code);
    if (code === "ORDER_RESERVED") assert.equal(UNRECOGNIZED_REASON_LABELS[code], "Đã giữ hàng, chưa hoàn thành"); // the canonical label varies with a deposit; the table keeps the neutral form
    else assert.equal(r?.label, UNRECOGNIZED_REASON_LABELS[code], code);
  }
});

test("approved glossary and fixed sentences (Product Owner P1 / P2)", () => {
  assert.deepEqual({ ...TERMS }, {
    reports: "Báo cáo",
    businessIntelligence: "Phân tích kinh doanh",
    supplier: "Nhà cung cấp",
    moneyDebtLedger: "Sổ công nợ tiền",
    followUpSummary: "Tóm tắt theo dõi",
    comingSoon: "Sắp ra mắt",
  });
  assert.equal(NO_SALES_DATA_TEXT, "Không có dữ liệu bán hàng trong kỳ này.");
  assert.equal(NO_SALES_DATA_MESSAGE, NO_SALES_DATA_TEXT, "the BI Center empty state and the mapping module never drift apart");
  assert.equal(NO_ITEMS_ROW_LABEL, "Chưa có sản phẩm trong đơn");
});
