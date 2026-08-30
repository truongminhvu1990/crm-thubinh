import test from "node:test";
import assert from "node:assert/strict";
import { resolveTargetDisplayText, seedingCampaignStatusBadgeVariant } from "./seeding.constants";

/** Phase 2K-BY (P1 #4/#5) — the single, locked implementation of 2K-BX's
 * display priority (source_label -> message -> honest empty state), now
 * reused by the target card, the AI-generation target picker, and the
 * Distribution modal — this is the one place its behavior is verified. */

test("resolveTargetDisplayText: source_label wins over message when both are present", () => {
  const result = resolveTargetDisplayText({ source_label: "Vòng ni 54.6 khách đang quan tâm", message: "Real Facebook content" });
  assert.equal(result, "Vòng ni 54.6 khách đang quan tâm");
});

test("resolveTargetDisplayText: falls back to message when source_label is null", () => {
  const result = resolveTargetDisplayText({ source_label: null, message: "Real Facebook content" });
  assert.equal(result, "Real Facebook content");
});

test("resolveTargetDisplayText: falls back to the honest empty state when both are null", () => {
  const result = resolveTargetDisplayText({ source_label: null, message: null });
  assert.equal(result, "Chưa có mô tả bài viết");
});

test("resolveTargetDisplayText: an empty-string source_label is treated as absent, falls through to message", () => {
  const result = resolveTargetDisplayText({ source_label: "", message: "Real Facebook content" });
  assert.equal(result, "Real Facebook content");
});

test("resolveTargetDisplayText: a custom emptyFallback is honored", () => {
  const result = resolveTargetDisplayText({ source_label: null, message: null }, "Custom fallback");
  assert.equal(result, "Custom fallback");
});

/** Phase 2K-BZ (P2 #3) — the one place a campaign status maps to a Badge
 * variant, now shared by both the campaign list page and Campaign
 * Detail's own header badge (previously hardcoded to "warning" there
 * regardless of actual status). */

test("seedingCampaignStatusBadgeVariant: Active -> success", () => {
  assert.equal(seedingCampaignStatusBadgeVariant("Active"), "success");
});

test("seedingCampaignStatusBadgeVariant: Completed -> muted", () => {
  assert.equal(seedingCampaignStatusBadgeVariant("Completed"), "muted");
});

test("seedingCampaignStatusBadgeVariant: Draft -> warning", () => {
  assert.equal(seedingCampaignStatusBadgeVariant("Draft"), "warning");
});
