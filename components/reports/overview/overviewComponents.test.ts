import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReconcileLine from "./ReconcileLine";
import ViewToggle from "./ViewToggle";
import {
  INVENTORY_CURRENT_STATE_LABEL,
  METRIC_LABELS,
  PRODUCT_VIEW_UNSUPPORTED_NOTE,
  productViewDisabledNote,
  reconcileView,
  type ReconcileView,
} from "@/lib/reports/overviewUi";

// Phase 1.4.1 regression tests for the four UAT findings. Components are rendered for real (server-side markup), not mocked.

const html = (view: ReconcileView, detail: number, overview: number | null) =>
  renderToStaticMarkup(createElement(ReconcileLine, { view, detailTotal: detail, overviewTotal: overview, countLabel: "5 sản phẩm" }));

test("FIX 1 race: detail loaded, overview NOT loaded yet -> pending, never 'KHÁC' and never invents a 0 overview", () => {
  const view = reconcileView(null, 13199999, false);
  assert.equal(view, "pending");
  const markup = html(view, 13199999, null);
  assert.ok(!markup.includes("KHÁC"));
  assert.ok(!/tổng quan 0/.test(markup));
  assert.ok(markup.includes("Đang đối soát với tổng quan"));
});

test("FIX 1: overview failed to load -> 'unavailable' (neutral), not a mismatch", () => {
  const view = reconcileView(null, 13199999, true);
  assert.equal(view, "unavailable");
  assert.ok(!html(view, 13199999, null).includes("KHÁC"));
});

test("FIX 1: detail not loaded yet -> pending, whatever the overview says", () => {
  assert.equal(reconcileView(13199999, null, false), "pending");
  assert.equal(reconcileView(0, null, false), "pending");
});

test("FIX 1: both available and equal -> match, with the unchanged sentence", () => {
  const view = reconcileView(30000000, 30000000, false);
  assert.equal(view, "match");
  const markup = html(view, 30000000, 30000000);
  assert.ok(markup.includes("Tổng chi tiết"));
  assert.ok(markup.includes("= tổng quan"));
  assert.ok(!markup.includes("KHÁC"));
});

test("FIX 1: both available and REALLY different -> mismatch is still reported, with both numbers, nothing adjusted", () => {
  const view = reconcileView(13199999, 13000000, false);
  assert.equal(view, "mismatch");
  const markup = html(view, 13000000, 13199999);
  assert.ok(markup.includes("KHÁC"));
  assert.ok(markup.includes("13.000.000"));
  assert.ok(markup.includes("13.199.999"));
  assert.ok(markup.includes("không tự điều chỉnh"));
  // a real overview of 0 against a non-zero detail is a real mismatch too (0 is a value, not 'missing')
  assert.equal(reconcileView(0, 5, false), "mismatch");
  assert.equal(reconcileView(0, 0, false), "match");
});

// Phase 1.5A (PO-approved): every Sales metric now has a product view, so no Sales toggle is disabled any more. The
// ViewToggle's generic disabled-reason mechanism (used by other screens) stays covered with a local sample note.
test("Phase 1.5A: no Sales metric disables the SẢN PHẨM toggle any more", () => {
  for (const m of ["order-value", "recognized-revenue", "unrecognized", "sold"] as const) assert.equal(productViewDisabledNote(m), null, m);
});

test("FIX 2: a disabled toggle option shows VISIBLE text (not only a title) and links it with aria-describedby", () => {
  const note = PRODUCT_VIEW_UNSUPPORTED_NOTE;
  assert.ok(note.startsWith("Chưa hỗ trợ xem theo sản phẩm"));
  const markup = renderToStaticMarkup(
    createElement(ViewToggle, {
      testId: "sales-view-toggle",
      value: "orders",
      onChange: () => {},
      options: [
        { value: "orders", label: "Xem theo ĐƠN" },
        { value: "products", label: "Xem theo SẢN PHẨM", disabled: true, title: note, disabledReason: note },
      ],
    })
  );
  assert.ok(markup.includes(`<p id="sales-view-toggle-reason" data-testid="sales-view-toggle-reason"`));
  assert.ok(markup.includes(`>${PRODUCT_VIEW_UNSUPPORTED_NOTE}</p>`));
  assert.ok(markup.includes(`aria-describedby="sales-view-toggle-reason"`));
  assert.ok(/<button[^>]*disabled=""[^>]*>Xem theo SẢN PHẨM<\/button>/.test(markup));
});

test("FIX 2: Recognized revenue and Sold keep BOTH views enabled and show no note", () => {
  assert.equal(productViewDisabledNote("recognized-revenue"), null);
  assert.equal(productViewDisabledNote("sold"), null);
  const markup = renderToStaticMarkup(
    createElement(ViewToggle, {
      testId: "sales-view-toggle",
      value: "products",
      onChange: () => {},
      options: [
        { value: "orders", label: "Xem theo ĐƠN" },
        { value: "products", label: "Xem theo SẢN PHẨM", disabled: false, disabledReason: undefined },
      ],
    })
  );
  assert.ok(!markup.includes("disabled"));
  assert.ok(!markup.includes("-reason"));
});

test("FIX 3: Inventory wording is a current-state statement with no date range", () => {
  assert.equal(INVENTORY_CURRENT_STATE_LABEL, "Dữ liệu tồn kho hiện tại — không phụ thuộc bộ lọc ngày");
  assert.ok(!/\d{2}\/\d{2}\/\d{4}/.test(INVENTORY_CURRENT_STATE_LABEL));
  assert.ok(!INVENTORY_CURRENT_STATE_LABEL.includes("Đang xem"));
});

test("FIX 4: one canonical label, 'Giá trị chưa ghi nhận', and the old wording is not the canonical one", () => {
  assert.equal(METRIC_LABELS.unrecognizedValue, "Giá trị chưa ghi nhận");
  assert.ok(!METRIC_LABELS.unrecognizedValue.includes("đơn"));
});
