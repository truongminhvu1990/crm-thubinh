import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PermissionGate, { PERMISSION_DENIED_TEXT, PERMISSION_ERROR_TEXT } from "./PermissionGate";
import { SkeletonCard, SkeletonTable } from "./Skeleton";

// Phase 1.5A (F): loading / denied / granted / error are four DIFFERENT states. The old pages collapsed "not known yet"
// into "false" and flashed "Bạn không có quyền xem báo cáo" for 0.5-1.0 s to users who do have the permission.

const render = (state: "loading" | "allowed" | "denied" | "error") =>
  renderToStaticMarkup(
    // createElement's overloads cannot express a required `children` prop passed positionally
    // eslint-disable-next-line react/no-children-prop
    createElement(PermissionGate, { state, title: "Bán hàng", children: createElement("p", { "data-testid": "page" }, "NỘI DUNG") })
  );

test("loading: skeleton, the page title stays, and the 'no permission' text is NEVER shown", () => {
  const markup = render("loading");
  assert.ok(markup.includes('data-permission-state="loading"'));
  assert.ok(markup.includes("data-skeleton"));
  assert.ok(markup.includes("Bán hàng"));
  assert.ok(!markup.includes(PERMISSION_DENIED_TEXT));
  assert.ok(!markup.includes(PERMISSION_ERROR_TEXT));
  assert.ok(!markup.includes("NỘI DUNG"), "no content before access is known");
});

test("denied: shows the message and no content", () => {
  const markup = render("denied");
  assert.ok(markup.includes(PERMISSION_DENIED_TEXT));
  assert.ok(markup.includes('data-permission-state="denied"'));
  assert.ok(!markup.includes("NỘI DUNG"));
});

test("error: a lookup failure is NOT reported as 'no permission' - it says the check failed and offers a reload", () => {
  const markup = render("error");
  assert.ok(markup.includes(PERMISSION_ERROR_TEXT));
  assert.ok(markup.includes("Tải lại"));
  assert.ok(!markup.includes(PERMISSION_DENIED_TEXT));
  assert.ok(!markup.includes("NỘI DUNG"));
});

test("allowed: renders the page and nothing else", () => {
  const markup = render("allowed");
  assert.equal(markup, '<p data-testid="page">NỘI DUNG</p>');
});

test("skeletons are marked data-skeleton so a loading region can be told apart from a region with data", () => {
  assert.ok(renderToStaticMarkup(createElement(SkeletonCard, { title: "Đã bán" })).includes("data-skeleton"));
  assert.ok(renderToStaticMarkup(createElement(SkeletonTable, {})).includes("data-skeleton"));
});
