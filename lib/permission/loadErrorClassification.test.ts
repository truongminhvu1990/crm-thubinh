import test from "node:test";
import assert from "node:assert/strict";
import { classifyPermissionLoadError } from "./loadErrorClassification";

/** Production Authorization Incident (2026-09-21) — the Permission Matrix
 * page's load() had no error handling around Promise.all at all, so a
 * 401/403 guard failure left isLoading stuck true forever (an infinite
 * spinner), never surfacing as the page's own "Không tìm thấy quyền phù
 * hợp" empty-state text (only reachable when every call genuinely returns
 * 200 with an empty result). These cases mirror exactly what
 * `permissionCenterApi.ts#getJson` throws for each response shape,
 * confirming the classifier and the guard's actual error bodies agree. */

test("classifies a 401 Unauthorized guard failure (getJson's exact thrown message)", () => {
  const result = classifyPermissionLoadError(new Error("Unauthorized"));
  assert.equal(result.kind, "unauthorized");
});

test("classifies a 403 Forbidden guard failure (getJson's exact thrown message)", () => {
  const result = classifyPermissionLoadError(new Error("Forbidden"));
  assert.equal(result.kind, "forbidden");
});

test("classifies a fallback status-code message when the response body has no `error` field", () => {
  // getJson: `new Error(json.error || \`Yêu cầu thất bại (${res.status})\`)`
  // when res.json() fails to parse or json.error is absent.
  const unauthorized = classifyPermissionLoadError(new Error("Yêu cầu thất bại (401)"));
  const forbidden = classifyPermissionLoadError(new Error("Yêu cầu thất bại (403)"));
  assert.equal(unauthorized.kind, "unauthorized");
  assert.equal(forbidden.kind, "forbidden");
});

test("classifies a network failure (fetch() rejects with TypeError, never reaches getJson's res.ok check)", () => {
  const result = classifyPermissionLoadError(new TypeError("Failed to fetch"));
  assert.equal(result.kind, "network");
});

test("classifies an unrecognized error as unknown rather than crashing", () => {
  const result = classifyPermissionLoadError(new Error("Yêu cầu thất bại (500)"));
  assert.equal(result.kind, "unknown");
});

test("handles a non-Error thrown value without crashing", () => {
  const result = classifyPermissionLoadError("some string");
  assert.equal(result.kind, "unknown");
  assert.equal(result.message, "some string");
});
