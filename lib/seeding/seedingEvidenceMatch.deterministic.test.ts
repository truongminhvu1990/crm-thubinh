import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStrict,
  normalizeLoose,
  findExactMatch,
  rankAiCandidates,
  hashCommentText,
  hashEvidenceSnapshot,
  AI_CANDIDATE_LIMIT,
} from "./seedingEvidenceMatch.deterministic";
import { FacebookLivePostCommentData } from "@/lib/facebookTools/facebookGraphClient";

function comment(id: string, message: string | undefined): FacebookLivePostCommentData {
  return { id, message, from: undefined };
}

test("normalizeStrict trims, collapses whitespace, lowercases, keeps diacritics", () => {
  assert.equal(normalizeStrict("  Sản   Phẩm  Đẹp  "), "sản phẩm đẹp");
  assert.notEqual(normalizeStrict("sản phẩm"), normalizeStrict("san pham"));
});

test("findExactMatch: whitespace/case-tolerant match still counts as Exact Match", () => {
  const comments = [comment("c1", "  Sản phẩm ĐẸP quá  "), comment("c2", "khác hẳn")];
  const result = findExactMatch("sản phẩm đẹp quá", comments);
  assert.equal(result.outcome, "Exact Match");
  assert.equal(result.matchedCommentId, "c1");
  assert.equal(result.matchCount, 1);
});

test("findExactMatch: genuinely different text does not match", () => {
  const comments = [comment("c1", "Giá bao nhiêu vậy shop"), comment("c2", "Còn hàng không ạ")];
  const result = findExactMatch("Sản phẩm này đẹp quá", comments);
  assert.equal(result.outcome, "No Deterministic Match");
  assert.equal(result.matchedCommentId, null);
});

test("findExactMatch: multiple identical matches still resolve to Exact Match (content-only, no identity ambiguity)", () => {
  const comments = [comment("c1", "Sản phẩm đẹp quá"), comment("c2", "Sản phẩm đẹp quá"), comment("c3", "khác")];
  const result = findExactMatch("Sản phẩm đẹp quá", comments);
  assert.equal(result.outcome, "Exact Match");
  assert.equal(result.matchCount, 2);
});

test("findExactMatch: comments with no message field are never a match", () => {
  const comments = [comment("c1", undefined)];
  const result = findExactMatch("bất kỳ nội dung nào", comments);
  assert.equal(result.outcome, "No Deterministic Match");
});

test("rankAiCandidates: bounded to the candidate limit and excludes empty-message comments", () => {
  const comments = Array.from({ length: 10 }, (_, i) => comment(`c${i}`, `sản phẩm đẹp biến thể ${i}`));
  comments.push(comment("empty", ""));
  comments.push(comment("nullish", undefined));
  const ranked = rankAiCandidates("sản phẩm đẹp quá", comments);
  assert.ok(ranked.length <= AI_CANDIDATE_LIMIT);
  assert.ok(ranked.every((c) => !!c.message?.trim()));
});

test("normalizeLoose strips NFD-decomposable diacritics/emoji/punctuation for candidate ranking only", () => {
  // "đ" is a distinct Vietnamese base letter (U+0111), not decomposable via
  // NFD — correctly stays "đ", not folded to "d". Only combining-diacritic
  // vowels (á -> a) fold away.
  assert.equal(normalizeLoose("Sản phẩm đẹp!! 😍"), normalizeLoose("san pham đep"));
});

test("hashCommentText is stable across cosmetic whitespace differences, changes on real edits", () => {
  assert.equal(hashCommentText("  Sản phẩm  đẹp  "), hashCommentText("Sản phẩm đẹp"));
  assert.notEqual(hashCommentText("Sản phẩm đẹp"), hashCommentText("Sản phẩm xấu"));
});

test("hashEvidenceSnapshot is order-independent (same comment set, different fetch order, same hash)", () => {
  const a = [comment("c1", "one"), comment("c2", "two")];
  const b = [comment("c2", "two"), comment("c1", "one")];
  assert.equal(hashEvidenceSnapshot(a), hashEvidenceSnapshot(b));
});

test("hashEvidenceSnapshot changes when the underlying comment set changes", () => {
  const a = [comment("c1", "one")];
  const b = [comment("c1", "one"), comment("c2", "two")];
  assert.notEqual(hashEvidenceSnapshot(a), hashEvidenceSnapshot(b));
});
